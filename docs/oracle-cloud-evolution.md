# Oracle Cloud Infrastructure (OCI) — Evolution API (LTV Boost)

Guia para subir a stack **Evolution API** (`evoapicloud/evolution-api` + Postgres + Redis + Manager) em uma VM na OCI, com HTTPS e integração ao dashboard (URL + ApiKey no `whatsapp_connections`).

## 1. O que você vai criar na OCI

| Recurso | Uso |
|--------|-----|
| **VCN** + subnet pública | Tráfego IPv4 da internet para a VM |
| **Instância Compute** | Ubuntu 22.04 LTS, Docker, `docker compose` |
| **IP público** | Anexado à VNIC da VM (reserved opcional) |
| **Security lists / NSG** | SSH (22), HTTP (80) e HTTPS (443) |

**Shape recomendado**

- **Always Free:** `VM.Standard.A1.Flex` (ARM) — 1–4 OCPUs e até 24 GB RAM no free tier. A imagem `evoapicloud/evolution-api:latest` costuma ter suporte **linux/arm64**; se o pull falhar, use shape **x86** (`VM.Standard.E2.1.Micro` ou `VM.Standard3.Flex` pago).
- Produção com mais carga: Flex x86 ou A1 com mais OCPU/RAM e disco **Block Volume** para dados do Postgres.

## 2. Rede e firewall

1. **Networking → Virtual cloud networks → Start VCN Wizard** (ou equivalente).
2. Crie subnet **pública** com route table apontando para **Internet Gateway**.
3. Na **Security List** da subnet (ou **Network Security Group** ligada à VNIC):

   | Origem | Protocolo | Portas | Destino |
   |--------|-----------|--------|---------|
   | Seu IP / VPN | TCP | 22 | VM (SSH) |
   | 0.0.0.0/0 | TCP | 80 | VM (HTTP — Let's Encrypt / redirecionamento) |
   | 0.0.0.0/0 | TCP | 443 | VM (HTTPS — API pública) |

   Não exponha a porta da API Evolution (8080) diretamente na internet; use **reverse proxy** (Caddy/Nginx) só em 80/443.

4. **Opcional:** restringir 443 a IPs fixos do escritório se só o Supabase Edge / backend forem clientes (menos comum para webhooks vindos da Evolution até sua URL).

## 3. Instância Compute

1. **Compute → Instances → Create instance.**
2. Imagem: **Canonical Ubuntu 22.04**.
3. Coloque a VM na subnet **pública** e marque **Assign public IPv4 address**.
4. Chave SSH: gere ou use uma existente; guarde o `.pem`.
5. Após **Running**, anote o **IP público**.

**DNS (recomendado)**  
Crie um registro **A** (ex.: `evolution.suaempresa.com.br`) → IP público. O `SERVER_URL` do Evolution deve ser exatamente essa URL **HTTPS**.

## 4. Bootstrap na VM (Ubuntu)

Conecte:

```bash
ssh -i sua-chave.pem ubuntu@SEU_IP_PUBLICO
```

Atualize o sistema e instale Docker (oficial):

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Saia e entre de novo no SSH para o grupo `docker` valer, ou use `newgrp docker`.

## 5. Código e `.env`

Copie a pasta **`evolution-api`** do repositório LTV Boost (ou clone o repo e entre em `evolution-api`).

```bash
cd ~
# exemplo: git clone ... && cd review-hub/evolution-api
cp .env.example .env
nano .env   # ou vim
```

Ajustes **obrigatórios para produção na OCI**:

- `SERVER_URL=https://evolution.suaempresa.com.br` — **sem barra final**; deve bater com o domínio do proxy.
- `EVOLUTION_HOST_PORT=8090` — porta **local** da API no host (atrás do Caddy); no `docker-compose.yml` padrão do repo já usa variável.
- `DATABASE_CONNECTION_URI` — usuário, senha e DB iguais a `POSTGRES_*` no final do `.env`.
- `CORS_ORIGIN` — domínio do app LTV Boost (ex.: `https://app.suaempresa.com.br`) ou lista separada por vírgula; evite `*` em produção se possível.
- `AUTHENTICATION_API_KEY` — defina uma chave forte; é o **ApiKey** que você grava no painel LTV Boost (Evolution).

Gere senhas fortes para `POSTGRES_PASSWORD` e para a API key.

## 6. Subir os containers

Na pasta onde está o `docker-compose.yml` (stack com api + redis + postgres + manager):

```bash
docker compose up -d
docker compose ps
docker compose logs -f api --tail=100
```

Teste localmente na VM (não expõe na internet ainda):

```bash
curl -sS "http://127.0.0.1:8090/" | head
```

## 7. HTTPS com Caddy (recomendado)

Na VM, instale [Caddy](https://caddyserver.com/docs/install#debian-ubuntu-raspbian) e use o arquivo de exemplo do repo:

```bash
sudo cp Caddyfile.example /etc/caddy/Caddyfile
# Edite o domínio e a porta upstream (8090 se for o seu EVOLUTION_HOST_PORT)
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

O Caddy obtém certificado Let's Encrypt automaticamente nas portas 80/443 abertas na Security List.

Arquivo de referência: `evolution-api/Caddyfile.example`.

## 8. Integração LTV Boost

1. No dashboard **WhatsApp → Configurar API** (provedor **Evolution**):
   - **URL da API:** `https://evolution.suaempresa.com.br`
   - **Chave:** mesma de `AUTHENTICATION_API_KEY` (ou equivalente configurado na Evolution).
2. Mantenha **`VITE_EVOLUTION_USE_PROXY`** como no deploy (geralmente **não** `false` em produção) para o browser não falar direto com a Evolution; o proxy Supabase aplica a ApiKey no servidor.

Webhook da Evolution para o Supabase: configure na instância apontando para  
`https://<seu-projeto>.supabase.co/functions/v1/whatsapp-webhook` (como já documentado no app).

## 9. Operação

- **Backup:** volumes Docker `postgres_data`, `evolution_instances`, `evolution_redis` — use snapshots de Block Volume ou `docker run` com dump `pg_dump` agendado.
- **Atualização:** `docker compose pull && docker compose up -d`.
- **Manager (UI Evolution):** no compose padrão fica em `127.0.0.1:8080` no host; para acesso remoto seguro, use túnel SSH ou coloque outro host no Caddy com autenticação — não deixe o Manager aberto sem proteção.

## 10. Compose específico OCI (opcional)

Exemplo com comentários e redes explícitas: `evolution-api/docker-compose.oci.example.yaml`.  
Uso:

```bash
docker compose -f docker-compose.yml -f docker-compose.oci.example.yaml up -d
```

(Valide portas para não conflitar com o Manager/Caddy.)

---

Se algo falhar no **ARM (A1)**, confira `docker compose pull` — se a imagem não tiver manifest arm64, migre para instância **x86** na OCI.
