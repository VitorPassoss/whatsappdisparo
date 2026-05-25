import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  MessageSquare, Send, Users, BarChart3, Shield,
  Zap, CheckCircle2, Eye, EyeOff, ArrowRight, Loader2, UserPlus, LogIn,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Static data ──────────────────────────────────────────────────────────────

const features = [
  { icon: Send, title: "Disparos em Massa", desc: "Envie para milhares de contatos com controle de velocidade e anti-ban." },
  { icon: MessageSquare, title: "Templates Aprovados", desc: "Use templates Meta com variáveis dinâmicas e imagens no header." },
  { icon: Users, title: "Listas de Contatos", desc: "Importe via TXT, CSV ou Excel e organize em listas reutilizáveis." },
  { icon: BarChart3, title: "Analytics em Tempo Real", desc: "Acompanhe taxa de sucesso, erros e progresso ao vivo." },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"login" | "register">("login");

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPwd, setShowLoginPwd] = useState(false);

  // Register form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [showRegPwd, setShowRegPwd] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      toast.success("Conta criada com sucesso! Bem-vindo(a)!");
      await utils.auth.me.invalidate();
      navigate("/");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!loading && isAuthenticated) {
    navigate("/");
    return null;
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      toast.error("Preencha e-mail e senha.");
      return;
    }
    loginMutation.mutate({ email: loginEmail.trim(), password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword || !regConfirm) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (regPassword.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (regPassword !== regConfirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    registerMutation.mutate({ name: regName.trim(), email: regEmail.trim(), password: regPassword });
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      {/* ── Left panel — branding ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#075E54] via-[#128C7E]/80 to-background" />
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[#25D366]/10 blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-lg leading-none">WA Disparador</p>
            <p className="text-white/60 text-xs mt-0.5">API Oficial Meta</p>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight tracking-tight">
              Disparos WhatsApp
              <br />
              <span className="text-[#25D366]">profissionais</span>
              <br />
              sem complicação.
            </h1>
            <p className="text-white/70 mt-4 text-base max-w-sm leading-relaxed">
              Conecte sua BM verificada e envie campanhas em massa com a API Oficial do WhatsApp Business.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                <div className="p-2 rounded-lg bg-[#25D366]/20 shrink-0">
                  <Icon className="w-4 h-4 text-[#25D366]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex items-center gap-6">
          {[
            { value: "99,9%", label: "Uptime garantido" },
            { value: "API Oficial", label: "Meta WhatsApp" },
            { value: "Anti-ban", label: "Proteção ativa" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-white/60">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — forms ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground text-lg leading-none">WA Disparador</p>
            <p className="text-muted-foreground text-xs mt-0.5">API Oficial Meta</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {tab === "login" ? "Bem-vindo de volta" : "Criar sua conta"}
            </h2>
            <p className="text-muted-foreground text-sm mt-1.5">
              {tab === "login"
                ? "Faça login para acessar seu painel de disparos."
                : "Preencha os dados abaixo para começar."}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-secondary rounded-xl mb-6">
            <button
              onClick={() => setTab("login")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === "login"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LogIn className="w-4 h-4" />
              Entrar
            </button>
            <button
              onClick={() => setTab("register")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === "register"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Criar conta
            </button>
          </div>

          {/* ── Login form ── */}
          {tab === "login" && (
            <form onSubmit={handleLogin} className="bg-card border border-border rounded-2xl p-7 shadow-xl shadow-black/20 space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#25D366]/5 border border-[#25D366]/20">
                <Shield className="w-4 h-4 text-[#25D366] shrink-0" />
                <p className="text-xs text-[#25D366]/90 font-medium">Acesso seguro — seus dados são criptografados</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">E-mail</Label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="bg-input border-border h-11"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Senha</Label>
                <div className="relative">
                  <Input
                    type={showLoginPwd ? "text" : "password"}
                    placeholder="Sua senha"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    className="bg-input border-border h-11 pr-10"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showLoginPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 font-semibold gap-2 bg-[#075E54] hover:bg-[#064d45] text-white shadow-lg shadow-[#075E54]/30"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>
                    <Zap className="w-4 h-4" />
                    Entrar no Painel
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground pt-1">
                Não tem conta?{" "}
                <button type="button" onClick={() => setTab("register")} className="text-[#25D366] hover:underline font-medium">
                  Criar conta grátis
                </button>
              </p>
            </form>
          )}

          {/* ── Register form ── */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="bg-card border border-border rounded-2xl p-7 shadow-xl shadow-black/20 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome completo</Label>
                <Input
                  type="text"
                  placeholder="João Silva"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  className="bg-input border-border h-11"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">E-mail</Label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  className="bg-input border-border h-11"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Senha <span className="text-muted-foreground/60">(mín. 8 caracteres)</span></Label>
                <div className="relative">
                  <Input
                    type={showRegPwd ? "text" : "password"}
                    placeholder="Crie uma senha forte"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    className="bg-input border-border h-11 pr-10"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showRegPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Confirmar senha</Label>
                <Input
                  type="password"
                  placeholder="Repita a senha"
                  value={regConfirm}
                  onChange={e => setRegConfirm(e.target.value)}
                  className={`bg-input border-border h-11 ${
                    regConfirm && regPassword !== regConfirm ? "border-red-500/60" : ""
                  }`}
                  autoComplete="new-password"
                  required
                />
                {regConfirm && regPassword !== regConfirm && (
                  <p className="text-xs text-red-400">As senhas não coincidem</p>
                )}
              </div>

              {/* Password strength */}
              {regPassword.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          regPassword.length >= i * 3
                            ? i <= 1 ? "bg-red-500" : i <= 2 ? "bg-yellow-500" : i <= 3 ? "bg-blue-500" : "bg-[#25D366]"
                            : "bg-secondary"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {regPassword.length < 8 ? "Senha muito curta" : regPassword.length < 10 ? "Senha fraca" : regPassword.length < 12 ? "Senha média" : "Senha forte"}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading || (!!regConfirm && regPassword !== regConfirm)}
                className="w-full h-11 font-semibold gap-2 bg-[#075E54] hover:bg-[#064d45] text-white shadow-lg shadow-[#075E54]/30"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Criar Conta Grátis
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground pt-1">
                Já tem conta?{" "}
                <button type="button" onClick={() => setTab("login")} className="text-[#25D366] hover:underline font-medium">
                  Fazer login
                </button>
              </p>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
            Ao entrar, você concorda com os{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Termos de Uso e Privacidade
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
