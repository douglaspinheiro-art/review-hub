import { createContext, useContext } from "react";

interface DemoContextType {
  isDemo: boolean;
  demoProfile: {
    id: string;
    full_name: string;
    company_name: string;
    plan: "growth";
    role: "user";
    trial_ends_at: string | null;
    onboarding_completed: boolean;
  };
}

export const DemoContext = createContext<DemoContextType>({
  isDemo: false,
  demoProfile: {
    id: "demo-user",
    full_name: "Studio Moda Feminina",
    company_name: "Studio Moda Feminina",
    plan: "growth",
    role: "user",
    trial_ends_at: null,
    onboarding_completed: true,
  },
});

export const useDemo = () => useContext(DemoContext);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  return (
    <DemoContext.Provider
      value={{
        isDemo: true,
        demoProfile: {
          id: "demo-user",
          full_name: "Studio Moda Feminina",
          company_name: "Studio Moda Feminina",
          plan: "growth",
          role: "user",
          trial_ends_at: null,
          onboarding_completed: true,
        },
      }}
    >
      <div data-ltv-demo="true" className="contents">
        {children}
      </div>
    </DemoContext.Provider>
  );
}
