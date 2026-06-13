import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Smartphone, Plus, Trash2, QrCode, RefreshCw, Loader2,
  CheckCircle2, AlertCircle, Wifi, WifiOff, Gauge, Link2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ChipStatus = "disconnected" | "connecting" | "connected";

export default function Chips() {
  const utils = trpc.useUtils();
  const { data: config } = trpc.evolution.config.useQuery();
  const { data: chips, isLoading } = trpc.evolution.listInstances.useQuery(undefined, {
    // Atualiza a lista periodicamente pra refletir conexões/quedas.
    refetchInterval: 5000,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(80);

  // QR connect modal
  const [qrChipId, setQrChipId] = useState<number | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const createMutation = trpc.evolution.createInstance.useMutation({
    onSuccess: (data) => {
      utils.evolution.listInstances.invalidate();
      setShowCreate(false);
      setName("");
      setDailyLimit(80);
      toast.success("Chip criado! Conecte-o via QR code.");
      // Abre o QR automaticamente pro chip recém-criado.
      openConnect(data.id);
    },
    onError: (err) => toast.error(err.message),
  });

  const connectMutation = trpc.evolution.connectInstance.useMutation({
    onSuccess: (data) => {
      setQrBase64(data.base64);
      setPairingCode(data.pairingCode);
      if (data.state === "open") {
        toast.success("Chip já está conectado!");
        closeConnect();
        utils.evolution.listInstances.invalidate();
      }
    },
    onError: (err) => {
      toast.error(err.message);
      closeConnect();
    },
  });

  const deleteMutation = trpc.evolution.deleteInstance.useMutation({
    onSuccess: () => {
      utils.evolution.listInstances.invalidate();
      toast.success("Chip removido!");
    },
    onError: (err) => toast.error(err.message),
  });

  // Polling do estado de conexão enquanto o modal de QR está aberto.
  const { data: stateData } = trpc.evolution.instanceState.useQuery(
    { id: qrChipId! },
    { enabled: qrChipId !== null, refetchInterval: 2500 },
  );

  useEffect(() => {
    if (qrChipId !== null && stateData?.connected) {
      toast.success("Chip conectado com sucesso! 🎉");
      closeConnect();
      utils.evolution.listInstances.invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateData?.connected]);

  const openConnect = (id: number) => {
    setQrChipId(id);
    setQrBase64(null);
    setPairingCode(null);
    connectMutation.mutate({ id });
  };

  const closeConnect = () => {
    setQrChipId(null);
    setQrBase64(null);
    setPairingCode(null);
  };

  const statusBadge = (status: ChipStatus) => {
    if (status === "connected")
      return (
        <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30 bg-emerald-400/5">
          <Wifi className="w-3 h-3 mr-1" /> Conectado
        </Badge>
      );
    if (status === "connecting")
      return (
        <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30 bg-yellow-400/5">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Conectando
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-xs text-red-400 border-red-400/30 bg-red-400/5">
        <WifiOff className="w-3 h-3 mr-1" /> Desconectado
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Chips (Evolution API)</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Conecte múltiplos números via QR code e dispare com rodízio anti-ban
            </p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            disabled={!config?.configured}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Novo Chip
          </Button>
        </div>

        {/* Config banner */}
        {!config?.configured ? (
          <div className="flex items-start gap-4 p-5 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Servidor Evolution não configurado</p>
              <p className="text-xs text-muted-foreground mt-1">
                Um admin precisa definir <code className="font-mono">EVOLUTION_API_URL</code> e{" "}
                <code className="font-mono">EVOLUTION_API_KEY</code> em{" "}
                <strong>Admin → Configurações</strong> antes de criar chips.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Servidor: <span className="font-mono text-foreground">{config.baseUrl}</span>
            </p>
          </div>
        )}

        {/* Chips list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Carregando...
          </div>
        ) : !chips || chips.length === 0 ? (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="p-4 rounded-2xl bg-primary/10">
                <Smartphone className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">Nenhum chip conectado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie um chip e escaneie o QR code com o WhatsApp do número
                </p>
              </div>
              <Button
                onClick={() => setShowCreate(true)}
                disabled={!config?.configured}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                Criar primeiro chip
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chips.map((chip) => {
              const usagePct = chip.dailyLimit > 0 ? Math.min(100, Math.round((chip.sentToday / chip.dailyLimit) * 100)) : 0;
              return (
                <Card key={chip.id} className="bg-card border-border hover:border-primary/30 transition-all">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
                          <Smartphone className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{chip.name}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {chip.phone ? `+${chip.phone}` : "número não detectado"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Remover chip "${chip.name}"? A instância será desconectada.`)) {
                            deleteMutation.mutate({ id: chip.id });
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      {statusBadge(chip.status as ChipStatus)}
                      {chip.profileName && (
                        <span className="text-xs text-muted-foreground truncate ml-2">{chip.profileName}</span>
                      )}
                    </div>

                    {/* Uso diário */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Gauge className="w-3 h-3" /> Uso hoje
                        </span>
                        <span className="font-mono text-foreground">
                          {chip.sentToday} / {chip.dailyLimit}
                        </span>
                      </div>
                      <Progress value={usagePct} className="h-1.5" />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant={chip.status === "connected" ? "outline" : "default"}
                        onClick={() => openConnect(chip.id)}
                        className="flex-1 gap-1.5 h-9 text-xs"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        {chip.status === "connected" ? "Reconectar" : "Conectar"}
                      </Button>
                    </div>

                    <p className="text-[10px] text-muted-foreground/60">
                      Criado em {format(new Date(chip.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      {" · "}{chip.sentTotal} enviados no total
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create chip dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              Novo Chip
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome do Chip</Label>
              <Input
                placeholder="Ex: Chip 01, Vendas SP, Suporte..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-input border-border"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" />
                Limite diário de envios (contingência anti-ban)
              </Label>
              <Input
                type="number"
                min={1}
                max={2000}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                className="bg-input border-border font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Recomendado 60–80 por chip. Quanto mais novo o número, menor o limite.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate({ name: name.trim(), dailyLimit })}
              disabled={!name.trim() || createMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Criar e Conectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR connect dialog */}
      <Dialog open={qrChipId !== null} onOpenChange={(open) => { if (!open) closeConnect(); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Conectar Chip
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-sm text-muted-foreground text-center">
              No WhatsApp do número: <strong>Aparelhos conectados → Conectar um aparelho</strong> e escaneie o código.
            </p>

            <div className="w-64 h-64 rounded-xl bg-white flex items-center justify-center overflow-hidden border border-border">
              {connectMutation.isPending && !qrBase64 ? (
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              ) : qrBase64 ? (
                <img src={qrBase64} alt="QR Code" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
                  <AlertCircle className="w-8 h-8" />
                  <p className="text-xs">QR code indisponível. Tente reconectar.</p>
                </div>
              )}
            </div>

            {pairingCode && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Ou use o código de pareamento:</p>
                <p className="text-lg font-mono font-bold text-primary tracking-widest">{pairingCode}</p>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Aguardando leitura do QR code...
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => qrChipId !== null && connectMutation.mutate({ id: qrChipId })}
              disabled={connectMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Gerar novo QR
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeConnect} className="w-full">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
