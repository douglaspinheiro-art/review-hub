const logos = [
  "TechStore", "ModaFit", "BelezaPura", "FarmáciaPop", "PetLove",
  "CasaDecor", "NutriVida", "SportMax", "EcoShop", "DigitalPay",
];

export default function ClientLogos() {
  return (
    <section className="py-12 border-y bg-muted/30">
      <div className="container mx-auto px-4 mb-6">
        <p className="text-center text-sm text-muted-foreground font-medium">
          Empresas que já confiam na LTV Boost
        </p>
      </div>
      <div className="overflow-hidden">
        <div className="flex animate-scroll-left gap-12 w-max">
          {[...logos, ...logos].map((name, i) => (
            <div key={i} className="flex items-center justify-center h-10 px-6 text-muted-foreground/50 font-bold text-lg whitespace-nowrap select-none">
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
