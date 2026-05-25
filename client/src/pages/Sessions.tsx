import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Zap, Plus, Trash2, Key, Hash, Shield,
  CheckCircle2, RefreshCw, Eye, EyeOff, AlertCircle,
  Facebook, Phone, Building2, ChevronRight, Loader2, Edit2, Save, X
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type PhoneNumber = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
};

type Waba = {
  id: string;
  name: string;
  phone_numbers: PhoneNumber[];
};

type FbExchangeResult = {
  accessToken: string;
  wabas: Waba[];
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sessions() {
  // Manual create state
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("Sessão Principal");
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");
  const [showToken, setShowToken] = useState(false);

  // Facebook OAuth state
  const [fbLoading, setFbLoading] = useState(false);
  const [fbResult, setFbResult] = useState<FbExchangeResult | null>(null);
  const [showFbModal, setShowFbModal] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<{ phone: PhoneNumber; waba: Waba } | null>(null);
  const [fbSessionName, setFbSessionName] = useState("");
  const [savingFb, setSavingFb] = useState(false);

  // WABA ID inline edit state
  const [editingWabaId, setEditingWabaId] = useState<number | null>(null);
  const [wabaIdDraft, setWabaIdDraft] = useState("");

  const utils = trpc.useUtils();
  const { data: sessions, isLoading } = trpc.sessions.list.useQuery();

  const createMutation = trpc.sessions.create.useMutation({
    onSuccess: () => {
      utils.sessions.list.invalidate();
      setShowCreate(false);
      setName("Sessão Principal");
      setAccessToken("");
      setPhoneNumberId("");
      setManualWabaId("");
      toast.success("Sessão criada com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.sessions.delete.useMutation({
    onSuccess: () => {
      utils.sessions.list.invalidate();
      toast.success("Sessão removida!");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateWabaIdMutation = trpc.sessions.updateWabaId.useMutation({
    onSuccess: () => {
      utils.sessions.list.invalidate();
      setEditingWabaId(null);
      setWabaIdDraft("");
      toast.success("WABA ID atualizado com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  const maskToken = (token: string) => {
    if (token.length <= 12) return "•".repeat(token.length);
    return token.slice(0, 6) + "•".repeat(token.length - 12) + token.slice(-6);
  };

  // ─── Facebook OAuth flow ───────────────────────────────────────────────────

  const handleFbMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== "fb_oauth_code") return;
    const code = event.data.code as string;
    if (!code) return;

    setFbLoading(true);
    try {
      const origin = window.location.origin;
      const res = await fetch("/api/auth/facebook/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, origin }),
      });
      const data = await res.json() as FbExchangeResult & { error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "Erro ao processar autenticação Facebook");
        return;
      }
      setFbResult(data);
      setShowFbModal(true);
    } catch (err) {
      toast.error("Erro de conexão ao processar autenticação");
    } finally {
      setFbLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleFbMessage);
    return () => window.removeEventListener("message", handleFbMessage);
  }, [handleFbMessage]);

  const handleConnectFacebook = async () => {
    setFbLoading(true);
    try {
      const origin = window.location.origin;
      const res = await fetch(`/api/auth/facebook/url?origin=${encodeURIComponent(origin)}`);
      const data = await res.json() as { url?: string; redirectUri?: string; error?: string };
      if (!data.url) {
        toast.error(data.error ?? "Erro ao gerar URL do Facebook");
        setFbLoading(false);
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(
        data.url,
        "fb_oauth",
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );
    } catch {
      toast.error("Erro ao conectar com o Facebook");
      setFbLoading(false);
    }
    // loading will be cleared when postMessage arrives
  };

  const handleSaveFbSession = async () => {
    if (!selectedPhone || !fbResult) return;
    const sessionName = fbSessionName.trim() || selectedPhone.phone.verified_name || selectedPhone.waba.name;
    setSavingFb(true);
    try {
      await createMutation.mutateAsync({
        name: sessionName,
        accessToken: fbResult.accessToken,
        phoneNumberId: selectedPhone.phone.id,
        wabaId: selectedPhone.waba.id,
      });
      setShowFbModal(false);
      setFbResult(null);
      setSelectedPhone(null);
      setFbSessionName("");
    } catch {
      // error handled by mutation
    } finally {
      setSavingFb(false);
    }
  };

  const startEditWabaId = (sessionId: number, currentWabaId: string | null) => {
    setEditingWabaId(sessionId);
    setWabaIdDraft(currentWabaId ?? "");
  };

  const cancelEditWabaId = () => {
    setEditingWabaId(null);
    setWabaIdDraft("");
  };

  const saveWabaId = (sessionId: number) => {
    if (!wabaIdDraft.trim()) {
      toast.error("WABA ID não pode ser vazio");
      return;
    }
    updateWabaIdMutation.mutate({ id: sessionId, wabaId: wabaIdDraft.trim() });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sessões WhatsApp</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Conecte sua conta Meta WhatsApp Business API
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleConnectFacebook}
              disabled={fbLoading}
              className="gap-2 bg-[#1877F2] hover:bg-[#1565D8] text-white font-semibold shadow-lg shadow-blue-500/20"
            >
              {fbLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Facebook className="w-4 h-4" />
              )}
              Entrar com o Facebook
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCreate(true)}
              className="gap-2 border-border"
            >
              <Plus className="w-4 h-4" />
              Manual
            </Button>
          </div>
        </div>

        {/* Facebook Connect Banner */}
        <div className="flex items-start gap-4 p-5 rounded-xl bg-[#1877F2]/5 border border-[#1877F2]/20">
          <div className="p-2.5 rounded-xl bg-[#1877F2]/10 shrink-0">
            <Facebook className="w-5 h-5 text-[#1877F2]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Conecte sua BM Verificada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em <strong>"Entrar com o Facebook"</strong> para fazer login com sua conta Meta,
              selecionar a BM verificada e o número de telefone da API. O token e o Phone Number ID
              serão configurados automaticamente.
            </p>
          </div>
          <Button
            onClick={handleConnectFacebook}
            disabled={fbLoading}
            size="sm"
            className="bg-[#1877F2] hover:bg-[#1565D8] text-white shrink-0"
          >
            {fbLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Conectar"}
          </Button>
        </div>

        {/* Sessions List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Carregando...
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="p-4 rounded-2xl bg-primary/10">
                <Zap className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">Nenhuma sessão configurada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Use o botão "Entrar com o Facebook" para conectar sua BM verificada
                </p>
              </div>
              <Button
                onClick={handleConnectFacebook}
                disabled={fbLoading}
                className="gap-2 bg-[#1877F2] hover:bg-[#1565D8] text-white"
              >
                <Facebook className="w-4 h-4" />
                Entrar com o Facebook
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessions.map(session => (
              <Card key={session.id} className="bg-card border-border hover:border-primary/30 transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-primary/10">
                        <Zap className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{session.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Criada em {format(new Date(session.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="text-xs text-emerald-400 border-emerald-400/30 bg-emerald-400/5"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Ativa
                      </Badge>
                      <button
                        onClick={() => {
                          if (confirm(`Remover sessão "${session.name}"?`)) {
                            deleteMutation.mutate({ id: session.id });
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors ml-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/50">
                      <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Phone Number ID</p>
                        <p className="text-sm font-mono text-foreground truncate">{session.phoneNumberId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/50">
                      <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Access Token</p>
                        <p className="text-sm font-mono text-foreground truncate">
                          {maskToken(session.accessToken)}
                        </p>
                      </div>
                    </div>

                    {/* WABA ID field — editable */}
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/50">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground mb-1">WABA ID</p>
                        {editingWabaId === session.id ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={wabaIdDraft}
                              onChange={e => setWabaIdDraft(e.target.value)}
                              placeholder="Ex: 2362166030929799"
                              className="h-7 text-xs font-mono bg-input border-border flex-1"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === "Enter") saveWabaId(session.id);
                                if (e.key === "Escape") cancelEditWabaId();
                              }}
                            />
                            <button
                              onClick={() => saveWabaId(session.id)}
                              disabled={updateWabaIdMutation.isPending}
                              className="p-1 rounded text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                              title="Salvar"
                            >
                              {updateWabaIdMutation.isPending
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Save className="w-3.5 h-3.5" />
                              }
                            </button>
                            <button
                              onClick={cancelEditWabaId}
                              className="p-1 rounded text-muted-foreground hover:bg-secondary transition-colors"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {session.wabaId ? (
                              <p className="text-sm font-mono text-foreground truncate flex-1">{session.wabaId}</p>
                            ) : (
                              <p className="text-xs text-yellow-400/80 flex-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                Não configurado — necessário para templates
                              </p>
                            )}
                            <button
                              onClick={() => startEditWabaId(session.id, session.wabaId ?? null)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                              title="Editar WABA ID"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Manual Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Nova Sessão Manual
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome da Sessão</Label>
              <Input
                placeholder="Ex: Sessão Principal, Número Vendas..."
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-input border-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                Phone Number ID
              </Label>
              <Input
                placeholder="Ex: 123456789012345"
                value={phoneNumberId}
                onChange={e => setPhoneNumberId(e.target.value)}
                className="bg-input border-border font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                WABA ID <span className="text-muted-foreground/60">(necessário para templates)</span>
              </Label>
              <Input
                placeholder="Ex: 2362166030929799"
                value={manualWabaId}
                onChange={e => setManualWabaId(e.target.value)}
                className="bg-input border-border font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                Access Token
              </Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  placeholder="EAAxxxxxxxxxxxxxxxx..."
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  className="bg-input border-border font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-400/80">
                Suas credenciais são armazenadas de forma segura e usadas apenas para enviar mensagens via Meta WhatsApp API.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate({ name, accessToken, phoneNumberId, wabaId: manualWabaId.trim() || undefined })}
              disabled={!name.trim() || !accessToken.trim() || !phoneNumberId.trim() || createMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Criar Sessão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facebook BM/Number Selection Modal */}
      <Dialog open={showFbModal} onOpenChange={setShowFbModal}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Facebook className="w-5 h-5 text-[#1877F2]" />
              Selecionar Número WhatsApp
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione a conta e o número de telefone que deseja conectar ao painel:
            </p>

            {fbResult && fbResult.wabas.length === 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
                <p className="text-sm text-yellow-400">
                  Nenhuma conta WhatsApp Business encontrada neste perfil do Facebook.
                </p>
              </div>
            )}

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {fbResult?.wabas.map(waba => (
                <div key={waba.id}>
                  {/* WABA header */}
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {waba.name}
                    </span>
                  </div>

                  {/* Phone numbers */}
                  {waba.phone_numbers.length === 0 ? (
                    <p className="text-xs text-muted-foreground pl-6 mb-2">Nenhum número disponível</p>
                  ) : (
                    waba.phone_numbers.map(phone => {
                      const isSelected = selectedPhone?.phone.id === phone.id;
                      return (
                        <button
                          key={phone.id}
                          onClick={() => setSelectedPhone({ phone, waba })}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left mb-2 ${
                            isSelected
                              ? "border-[#1877F2] bg-[#1877F2]/10"
                              : "border-border bg-secondary/30 hover:border-[#1877F2]/40 hover:bg-[#1877F2]/5"
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${isSelected ? "bg-[#1877F2]/20" : "bg-secondary"}`}>
                            <Phone className={`w-4 h-4 ${isSelected ? "text-[#1877F2]" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{phone.verified_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{phone.display_phone_number}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                phone.quality_rating === "GREEN"
                                  ? "text-emerald-400 border-emerald-400/30"
                                  : phone.quality_rating === "YELLOW"
                                  ? "text-yellow-400 border-yellow-400/30"
                                  : "text-red-400 border-red-400/30"
                              }`}
                            >
                              {phone.quality_rating === "GREEN" ? "Alta" : phone.quality_rating === "YELLOW" ? "Média" : "Baixa"}
                            </Badge>
                            <ChevronRight className={`w-4 h-4 transition-colors ${isSelected ? "text-[#1877F2]" : "text-muted-foreground"}`} />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              ))}
            </div>

            {selectedPhone && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                <Label className="text-xs text-muted-foreground">Nome da Sessão</Label>
                <Input
                  placeholder={selectedPhone.phone.verified_name || selectedPhone.waba.name}
                  value={fbSessionName}
                  onChange={e => setFbSessionName(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFbModal(false); setSelectedPhone(null); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveFbSession}
              disabled={!selectedPhone || savingFb}
              className="bg-[#1877F2] hover:bg-[#1565D8] text-white gap-2"
            >
              {savingFb ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Conectar Número
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
