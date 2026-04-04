const logos = [
  "TechStore", "ModaFit", "BelezaPura", "FarmáciaPop", "PetLove",
  "CasaDecor", "NutriVida", "SportMax", "EcoShop", "DigitalPay",
  "VesteBem", "NaturalCo", "SmartGear", "FloraShop", "UrbanStyle",
];

export default function ClientLogos() {
  return (
    <section className="py-14 border-y border-border/50">
      <div className="container mx-auto px-4 mb-6">
        <p className="text-center text-xs text-muted-foreground font-medium uppercase tracking-widest">
          Mais de 200 e-commerces confiam na LTV Boost
        </p>
      </div>
      <div className="overflow-hidden">
        <div className="flex animate-scroll-left gap-16 w-max">
          {[...logos, ...logos].map((name, i) => (
            <div key={i} className="flex items-center justify-center h-8 px-4 text-muted-foreground/30 font-display font-bold text-lg whitespace-nowrap select-none tracking-tight">
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
