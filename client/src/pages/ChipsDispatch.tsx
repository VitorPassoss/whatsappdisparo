import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Send, Zap, Users, CheckCircle2, XCircle, Clock, Terminal,
  RefreshCw, Plus, AlertTriangle, Smartphone, Wifi, WifiOff,
  Shield, Sparkles, Loader2,
} from "lucide-react";
import { format } from "date-fns";

type CsvContact = { phone: string; variables: string[] };

// Parse de CSV `phone,var1,...`. Pula header opcional e linhas sem telefone.
function parseCsv(text: string): CsvContact[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const start = lines[0].toLowerCase().startsWith("phone") ? 1 : 0;
  const out: CsvContact[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const phone = (cols[0] ?? "").replace(/\D/g, "");
    if (phone.length < 8) continue;
    out.push({ phone, variables: cols.slice(1) });
  }
  return out;
}

export default function ChipsDispatch() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [selectedChips, setSelectedChips] = useState<number[]>([]);
  const [csvText, setCsvText] = useState("");
  const [csvContacts, setCsvContacts] = useState<CsvContact[]>([]);
  const [rawPhones, setRawPhones] = useState("");
  const [listId, setListId] = useState<string>("");
  // Anti-ban
  const [delayMin, setDelayMin] = useState(10);
  const [delayMax, setDelayMax] = useState(30);
  const [simulateTyping, setSimulateTyping] = useState(true);
  const [shuffle, setShuffle] = useState(true);

  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);

  const { data: chips } = trpc.evolution.listInstances.useQuery(undefined, { refetchInterval: 5000 });
  const { data: contactLists } = trpc.contactLists.list.useQuery();

  const connectedChips = (chips ?? []).filter((c) => c.status === "connected");

  const { data: activeCampaign } = trpc.campaigns.get.useQuery(
    { id: activeCampaignId! },
    { enabled: !!activeCampaignId, refetchInterval: activeCampaignId ? 1500 : false },
  );
  const { data: campaignContacts } = trpc.campaigns.getContacts.useQuery(
    { campaignId: activeCampaignId! },
    { enabled: !!activeCampaignId, refetchInterval: activeCampaignId ? 1500 : false },
  );

  useEffect(() => {
    if (activeCampaign?.status === "completed" || activeCampaign?.status === "failed") {
      setIsSending(false);
    }
  }, [activeCampaign?.status]);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [campaignContacts]);

  const sendMutation = trpc.evolution.send.useMutation({
    onSuccess: (data) => {
      setActiveCampaignId(data.campaignId);
      setIsSending(true);
      toast.success(`Disparo iniciado com ${data.usingChips} chip(s)! Capacidade hoje: ${data.capacity}.`);
    },
    onError: (err) => {
      setIsSending(false);
      toast.error(err.message);
    },
  });

  const toggleChip = (id: number) => {
    setSelectedChips((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleValidateCsv = () => {
    const parsed = parseCsv(csvText);
    if (parsed.length === 0) {
      setCsvContacts([]);
      return toast.error("Nenhum contato válido encontrado no CSV");
    }
    setCsvContacts(parsed);
    toast.success(`${parsed.length} contato(s) carregado(s)`);
  };

  const csvPreviewCount = parseCsv(csvText).length;
  const phoneCount = rawPhones
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/\D/g, ""))
    .filter((s) => s.length >= 8).length;
  const hasList = !!listId && listId !== "none";
  const totalContacts = csvContacts.length + phoneCount;

  // Capacidade agregada dos chips selecionados e conectados (anti-ban).
  const selectedConnected = connectedChips.filter((c) => selectedChips.includes(c.id));
  const capacity = selectedConnected.reduce(
    (sum, c) => sum + Math.max(0, c.dailyLimit - c.sentToday),
    0,
  );

  const handleSend = () => {
    if (!name.trim()) return toast.error("Dê um nome à campanha");
    if (!message.trim()) return toast.error("Escreva a mensagem (copy)");
    if (selectedChips.length === 0) return toast.error("Selecione ao menos um chip");
    if (selectedConnected.length === 0) return toast.error("Nenhum chip selecionado está conectado");
    if (csvText.trim() && csvContacts.length === 0)
      return toast.error('Clique em "Validar e Carregar" o CSV antes de disparar');
    if (csvContacts.length === 0 && !rawPhones.trim() && !hasList)
      return toast.error("Adicione contatos (CSV, números ou lista)");
    if (delayMax < delayMin) return toast.error("O delay máximo deve ser ≥ ao mínimo");
    setShowConfirm(true);
  };

  const handleConfirmSend = () => {
    setShowConfirm(false);
    sendMutation.mutate({
      name: name.trim(),
      message: message.trim(),
      instanceIds: selectedChips,
      contacts: csvContacts.length > 0 ? csvContacts : undefined,
      rawPhones: rawPhones || undefined,
      listId: hasList ? parseInt(listId) : undefined,
      delayMin,
      delayMax,
      simulateTyping,
      shuffle,
    });
  };

  const handleNewDispatch = () => {
    setActiveCampaignId(null);
    setIsSending(false);
    setName("");
    setMessage("");
    setRawPhones("");
    setListId("");
    setCsvText("");
    setCsvContacts([]);
  };

  const progress = activeCampaign
    ? activeCampaign.totalContacts > 0
      ? Math.round((activeCampaign.sentCount / activeCampaign.totalContacts) * 100)
      : 0
    : 0;

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": case "delivered": case "read":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "failed":
        return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Disparo por Chips</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Rodízio entre múltiplos números via Evolution API, com copy livre e contingência anti-ban
            </p>
          </div>
          {activeCampaignId && (
            <Button variant="outline" onClick={handleNewDispatch} className="gap-2">
              <Plus className="w-4 h-4" /> Novo Disparo
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: config */}
          <div className="space-y-4">
            {/* Seleção de chips */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-primary" />
                    Chips para Rodízio
                  </CardTitle>
                  {selectedConnected.length > 0 && (
                    <Badge variant="outline" className="text-xs text-primary border-primary/30">
                      capacidade hoje: {capacity}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {!chips || chips.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 bg-secondary/30 rounded-lg">
                    Nenhum chip cadastrado. Vá em <strong>Chips</strong> para criar e conectar números.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {chips.map((chip) => {
                      const connected = chip.status === "connected";
                      const selected = selectedChips.includes(chip.id);
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          disabled={isSending || !connected}
                          onClick={() => toggleChip(chip.id)}
                          className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-secondary/30 hover:border-primary/40"
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg ${selected ? "bg-primary/20" : "bg-secondary"}`}>
                            {connected ? (
                              <Wifi className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <WifiOff className="w-4 h-4 text-red-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{chip.name}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {chip.phone ? `+${chip.phone}` : "—"} · {chip.sentToday}/{chip.dailyLimit} hoje
                            </p>
                          </div>
                          {selected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Copy / mensagem */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Mensagem (Copy)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nome da Campanha</Label>
                  <Input
                    placeholder="Ex: Promoção Junho"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSending}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Texto da mensagem</Label>
                  <Textarea
                    placeholder={"Olá {{1}}! {Tudo bem|Como vai}? Temos uma novidade pra você 🎉\n\nUse {opção1|opção2} para variar e {{1}}, {{2}} para variáveis do CSV."}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isSending}
                    rows={6}
                    className="bg-input border-border resize-y text-sm min-h-[140px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    <Sparkles className="w-3 h-3 inline mr-1" />
                    Spintax <code className="font-mono">{"{a|b|c}"}</code> varia a copy a cada envio · Variáveis{" "}
                    <code className="font-mono">{"{{1}}"}</code> vêm do CSV · separe blocos com uma linha <code className="font-mono">---</code>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Contingência anti-ban */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Contingência Anti-ban
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Delay mín (s)</Label>
                    <Input
                      type="number" min={1} value={delayMin}
                      onChange={(e) => setDelayMin(Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={isSending}
                      className="bg-input border-border font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Delay máx (s)</Label>
                    <Input
                      type="number" min={1} value={delayMax}
                      onChange={(e) => setDelayMax(Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={isSending}
                      className="bg-input border-border font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3">
                  <span className="text-sm font-medium text-foreground">Simular digitação ("digitando...")</span>
                  <button
                    type="button"
                    onClick={() => setSimulateTyping((v) => !v)}
                    disabled={isSending}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${simulateTyping ? "bg-primary" : "bg-muted"}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${simulateTyping ? "translate-x-4" : "translate-x-1"}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3">
                  <span className="text-sm font-medium text-foreground">Embaralhar ordem dos contatos</span>
                  <button
                    type="button"
                    onClick={() => setShuffle((v) => !v)}
                    disabled={isSending}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${shuffle ? "bg-primary" : "bg-muted"}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${shuffle ? "translate-x-4" : "translate-x-1"}`} />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cada chip respeita seu próprio limite diário e espaça os envios com delay aleatório entre {delayMin}s e {delayMax}s.
                </p>
              </CardContent>
            </Card>

            {/* Contatos */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Contatos
                  </CardTitle>
                  {csvPreviewCount > 0 && (
                    <Badge variant="outline" className="text-xs text-primary border-primary/30">
                      {csvPreviewCount} no CSV
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">CSV (phone,var1,var2,...)</Label>
                  <Textarea
                    placeholder={"phone,var1,var2\n5511999999999,João,link"}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    disabled={isSending}
                    rows={4}
                    className="bg-input border-border resize-y font-mono text-xs min-h-[90px]"
                  />
                  <Button
                    type="button"
                    onClick={handleValidateCsv}
                    disabled={isSending || !csvText.trim()}
                    className="w-full gap-2 bg-emerald-500 text-white hover:bg-emerald-600 h-10 font-semibold"
                  >
                    <Plus className="w-4 h-4" /> Validar e Carregar
                  </Button>
                  {csvContacts.length > 0 && (
                    <p className="text-xs text-emerald-400">✓ {csvContacts.length} contato(s) prontos.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Lista salva (opcional)</Label>
                  <Select value={listId} onValueChange={setListId} disabled={isSending}>
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Selecionar lista..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma lista</SelectItem>
                      {contactLists?.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Números avulsos (um por linha)</Label>
                    {phoneCount > 0 && (
                      <Badge variant="outline" className="text-xs text-primary border-primary/30">{phoneCount}</Badge>
                    )}
                  </div>
                  <Textarea
                    placeholder={"5511999999999\n5521988888888"}
                    value={rawPhones}
                    onChange={(e) => setRawPhones(e.target.value)}
                    disabled={isSending}
                    rows={4}
                    className="bg-input border-border resize-none font-mono text-sm"
                  />
                </div>

                <Button
                  onClick={handleSend}
                  disabled={isSending || sendMutation.isPending}
                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 font-semibold"
                >
                  {isSending || sendMutation.isPending ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Iniciar Disparo</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: console */}
          <div className="space-y-4">
            {activeCampaign && (
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{activeCampaign.name}</span>
                    <Badge
                      variant="outline"
                      className={
                        activeCampaign.status === "completed" ? "text-emerald-400 border-emerald-400/30" :
                        activeCampaign.status === "running" ? "text-blue-400 border-blue-400/30" :
                        activeCampaign.status === "failed" ? "text-red-400 border-red-400/30" :
                        "text-yellow-400 border-yellow-400/30"
                      }
                    >
                      {activeCampaign.status === "running" && <RefreshCw className="w-3 h-3 mr-1 animate-spin" />}
                      {activeCampaign.status === "completed" ? "Concluído" :
                       activeCampaign.status === "running" ? "Enviando" :
                       activeCampaign.status === "failed" ? "Falhou" : "Pendente"}
                    </Badge>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Total", value: activeCampaign.totalContacts, color: "text-foreground" },
                      { label: "Enviados", value: activeCampaign.sentCount, color: "text-primary" },
                      { label: "Sucesso", value: activeCampaign.successCount, color: "text-emerald-400" },
                      { label: "Erros", value: activeCampaign.errorCount, color: "text-red-400" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-2 rounded-lg bg-secondary/50">
                        <p className={`text-lg font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card border-border flex flex-col" style={{ minHeight: "400px" }}>
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  Console de Envio
                  {isSending && (
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ao vivo
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <div
                  ref={consoleRef}
                  className="h-full overflow-y-auto p-4 font-mono text-xs space-y-1.5"
                  style={{ maxHeight: "640px", minHeight: "350px" }}
                >
                  {!activeCampaignId ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
                      <Terminal className="w-10 h-10 opacity-20" />
                      <p>Aguardando disparo...</p>
                      <p className="text-xs opacity-60">Configure os chips e a copy para começar</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-muted-foreground pb-2 border-b border-border mb-2">
                        <span className="text-primary">▶</span> {activeCampaign?.name} — {activeCampaign?.totalContacts} contatos
                      </div>
                      {campaignContacts?.map((contact) => (
                        <div key={contact.id} className="flex items-center gap-2">
                          {statusIcon(contact.status)}
                          <span className="text-muted-foreground">[{
                            contact.sentAt ? format(new Date(contact.sentAt), "HH:mm:ss") : "--:--:--"
                          }]</span>
                          <span className="text-foreground">{contact.phone}</span>
                          {contact.instanceName && (
                            <span className="text-muted-foreground/50 truncate">via {contact.instanceName.split("_").slice(-2, -1)[0] ?? "chip"}</span>
                          )}
                          {contact.status === "sent" || contact.status === "delivered" ? (
                            <span className="text-emerald-400 ml-auto">✓</span>
                          ) : contact.status === "failed" ? (
                            <span className="text-red-400 ml-auto truncate">✗ {contact.errorMessage ?? "erro"}</span>
                          ) : (
                            <span className="text-yellow-400 ml-auto">⏳</span>
                          )}
                        </div>
                      ))}
                      {activeCampaign?.status === "completed" && (
                        <div className="mt-3 pt-3 border-t border-border text-emerald-400">
                          ✓ Concluído — {activeCampaign.successCount} sucessos, {activeCampaign.errorCount} erros
                        </div>
                      )}
                      {activeCampaign?.status === "failed" && (
                        <div className="mt-3 pt-3 border-t border-border text-red-400">
                          ✗ Disparo encerrado com falhas (auto-pausa anti-ban pode ter ativado)
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Confirm */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Confirmar Disparo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-secondary/50 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Chips conectados</span><span className="font-medium text-primary">{selectedConnected.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Contatos</span><span className="font-medium text-primary">{totalContacts}{hasList ? " + lista" : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Capacidade hoje</span><span className="font-medium text-foreground font-mono">{capacity}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Delay</span><span className="font-medium text-foreground font-mono">{delayMin}–{delayMax}s</span></div>
            </div>
            {totalContacts > capacity && (
              <p className="text-xs text-yellow-400 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Você tem mais contatos ({totalContacts}) do que a capacidade diária dos chips ({capacity}). O excedente ficará pendente até amanhã ou até aumentar os limites.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancelar</Button>
            <Button onClick={handleConfirmSend} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
              <Send className="w-4 h-4" /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
