import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Smartphone, Loader2, Facebook,
  ArrowRight, Shield, ChevronDown, ExternalLink,
  HelpCircle, AlertTriangle, Info, Zap, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { launchEmbeddedSignup } from "@/lib/whatsapp/meta-embedded-signup";
import { getMetaAppConfig } from "@/lib/whatsapp/meta-app-config";

export default function Setup() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [waConnecting, setWaConnecting] = useState(false);
  const [waConnected, setWaConnected] = useState<{ phone?: string } | null>(null);
  const [userStoreId, setUserStoreId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("stores")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setUserStoreId(data.id);
      });
  }, [user?.id]);

  const handleConnectWhatsApp = useCallback(async () => {
    if (!userStoreId) {
      toast.error("Store not found. Please go back to onboarding.");
      return;
    }
    setWaConnecting(true);
    try {
      const cfg = await getMetaAppConfig();
      const result = await launchEmbeddedSignup({
        appId: cfg.appId,
        configId: cfg.configId,
        graphVersion: cfg.graphVersion,
        storeId: userStoreId,
        instanceName: "onboarding",
      });
      if (result.ok) {
        setWaConnected({ phone: result.display_phone_number });
        toast.success("✅ WhatsApp connected successfully!");
      } else {
        toast.error(result.error || "Could not connect.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error connecting WhatsApp. Try again.");
    } finally {
      setWaConnecting(false);
    }
  }, [userStoreId]);

  const handleGoToDashboard = async () => {
    setIsLaunching(true);
    try {
      sessionStorage.removeItem("ltv_funnel_data");
      sessionStorage.removeItem("ltv_show_community");
      sessionStorage.removeItem("ltv_company");
      navigate("/dashboard?setup=complete&firstweek=true");
    } catch {
      toast.error("Could not proceed. Try again.");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center p-6 md:p-20 overflow-x-hidden">
      <div className="max-w-3xl w-full space-y-12">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
            <span className="font-bold tracking-tighter">LTV BOOST</span>
          </div>
          <Badge variant="outline" className="text-[10px] font-black tracking-widest text-primary border-primary/30">
            FINAL STEP
          </Badge>
        </div>

        {/* WhatsApp Connection */}
        <div className="space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-[0.2em]">
              <MessageCircle className="w-3 h-3" /> Connect WhatsApp
            </div>
            <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
              Activate your recovery engine
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto font-medium">
              WhatsApp is where AI prescriptions are executed automatically. Connect now or set up later in dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8 md:p-12">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-bold">Meta Cloud API Connection</h3>
                    <p className="text-xs text-muted-foreground">Official WhatsApp Business (Graph API).</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-bold">Instant Recovery</h3>
                    <p className="text-xs text-muted-foreground">Carts and expired payments recovered in real time.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                {waConnected ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3 animate-in fade-in zoom-in">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                    <div>
                      <p className="font-bold text-emerald-400 text-sm">WhatsApp connected!</p>
                      {waConnected.phone && (
                        <p className="text-xs text-muted-foreground font-mono">{waConnected.phone}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => void handleConnectWhatsApp()}
                    disabled={waConnecting}
                    className="w-full h-12 bg-[#1877F2] hover:bg-[#1877F2]/90 text-white font-bold rounded-xl gap-2"
                  >
                    {waConnecting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                    ) : (
                      <><Facebook className="w-4 h-4" /> Connect with Facebook</>
                    )}
                  </Button>
                )}
              </div>

              {/* Help Guide */}
              {!waConnected && (
                <Collapsible open={showGuide} onOpenChange={setShowGuide} className="mt-4">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors w-full group">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-bold">Need help connecting?</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 ml-auto transition-transform", showGuide && "rotate-180")} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-4">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-300/90 leading-relaxed">
                          You <strong>don't need to create a Meta Developers app</strong>. LTV Boost handles everything automatically.
                          Just have a <strong>verified Business Manager</strong> on Facebook.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {[
                          { num: "1", title: "Create or access your Business Manager", link: "https://business.facebook.com/overview", linkLabel: "Open Business Manager" },
                          { num: "2", title: "Verify your business", desc: "Settings → Security Center → Verification. You'll need your company ID.", link: "https://business.facebook.com/settings/security", linkLabel: "Go to Verification" },
                          { num: "3", title: "Add a WhatsApp number", desc: "Use a number not linked to personal WhatsApp." },
                          { num: "4", title: 'Click "Connect with Facebook" above', desc: "LTV Boost handles tokens, webhooks, and number setup automatically." },
                        ].map((item) => (
                          <div key={item.num} className="flex gap-3 items-start">
                            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-[10px] font-black mt-0.5">
                              {item.num}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-white/90">{item.title}</p>
                              {item.desc && <p className="text-[11px] text-muted-foreground">{item.desc}</p>}
                              {item.link && (
                                <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300">
                                  {item.linkLabel} <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-300/80 leading-relaxed">
                          If the popup closes without completing, check that pop-ups are allowed in your browser and you're logged into the correct Facebook account.
                        </p>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
              <div className="relative bg-black rounded-2xl p-6 border border-white/10 shadow-2xl flex flex-col items-center gap-4">
                {waConnected ? (
                  <>
                    <div className="w-48 h-48 rounded-xl flex items-center justify-center bg-emerald-500/10">
                      <CheckCircle2 className="w-24 h-24 text-emerald-500 animate-in zoom-in" />
                    </div>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Connected ✓</p>
                  </>
                ) : (
                  <>
                    <div className="w-48 h-48 rounded-xl flex items-center justify-center bg-[#1877F2]/10 border border-[#1877F2]/20">
                      <div className="text-center space-y-3">
                        <Facebook className="w-16 h-16 text-[#1877F2] mx-auto" />
                        <p className="text-xs text-muted-foreground font-medium">Automatic connection<br />via Meta Business</p>
                      </div>
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      {waConnecting ? "Connecting..." : "Awaiting Connection..."}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CTA Footer */}
        <div className="pt-12 border-t border-[#1E1E2E] flex flex-col items-center gap-4">
          <Button
            size="lg"
            onClick={() => void handleGoToDashboard()}
            disabled={isLaunching}
            className="h-14 px-12 text-lg font-black bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/20 hover:scale-105 transition-all gap-2 group"
          >
            {isLaunching ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Loading...</>
            ) : (
              <>Go to Dashboard <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
            )}
          </Button>
          {!waConnected && (
            <button
              onClick={() => void handleGoToDashboard()}
              className="text-xs text-muted-foreground hover:text-white transition-colors"
            >
              Skip for now — connect later in settings
            </button>
          )}
          <p className="text-[9px] font-black text-muted-foreground flex items-center gap-1.5 uppercase tracking-[0.2em]">
            <Shield className="w-3.5 h-3.5 text-emerald-500" /> End-to-end encryption active
          </p>
        </div>
      </div>
    </div>
  );
}
