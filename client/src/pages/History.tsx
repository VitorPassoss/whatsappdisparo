import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  History as HistoryIcon, Search, CheckCircle2,
  XCircle, Clock, ChevronRight, Users, Calendar, MessageSquare,
  TrendingUp, RefreshCw, CalendarClock, Ban
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function History() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [contactFilter, setContactFilter] = useState("all");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: campaigns, isLoading } = trpc.campaigns.list.useQuery({
    search: search || undefined,
    status: status === "all" ? undefined : status,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: campaignDetail } = trpc.campaigns.get.useQuery(
    { id: selectedCampaignId! },
    { enabled: !!selectedCampaignId }
  );

  const { data: contacts } = trpc.campaigns.getContacts.useQuery(
    { campaignId: selectedCampaignId!, status: contactFilter === "all" ? undefined : contactFilter },
    { enabled: !!selectedCampaignId }
  );

  const cancelMutation = trpc.campaigns.cancel.useMutation({
    onSuccess: () => {
      toast.success("Agendamento cancelado", { description: "A campanha foi cancelada com sucesso." });
      utils.campaigns.list.invalidate();
      setCancellingId(null);
    },
    onError: (err) => {
      toast.error("Erro ao cancelar", { description: err.message });
      setCancellingId(null);
    },
  });

  const handleCancel = (e: React.MouseEvent, campaignId: number) => {
    e.stopPropagation();
    setCancellingId(campaignId);
    cancelMutation.mutate({ id: campaignId });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">Concluída</Badge>;
      case "running":
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />Enviando
        </Badge>;
      case "failed":
        return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20">Falhou</Badge>;
      case "scheduled":
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20">
          <CalendarClock className="w-3 h-3 mr-1" />Agendado
        </Badge>;
      case "cancelled":
        return <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20">
          <Ban className="w-3 h-3 mr-1" />Cancelado
        </Badge>;
      default:
        return <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20">Pendente</Badge>;
    }
  };

  const contactStatusIcon = (status: string) => {
    switch (status) {
      case "sent": case "delivered": case "read":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-400" />;
    }
  };

  const successRate = (c: { successCount: number; totalContacts: number }) =>
    c.totalContacts > 0 ? Math.round((c.successCount / c.totalContacts) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de Campanhas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Acompanhe todas as campanhas de disparo realizadas
          </p>
        </div>

        {/* Filters */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px] space-y-1">
                <label className="text-xs text-muted-foreground">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Nome ou mensagem..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 bg-input border-border"
                  />
                </div>
              </div>
              <div className="w-44 space-y-1">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                    <SelectItem value="running">Enviando</SelectItem>
                    <SelectItem value="failed">Falhou</SelectItem>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">De</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="bg-input border-border w-36"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Até</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="bg-input border-border w-36"
                />
              </div>
              {(search || status !== "all" || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearch(""); setStatus("all"); setDateFrom(""); setDateTo(""); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Campaigns List */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <HistoryIcon className="w-4 h-4 text-primary" />
              Campanhas
              {campaigns && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {campaigns.length} resultado{campaigns.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Carregando...
              </div>
            ) : !campaigns || campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <HistoryIcon className="w-10 h-10 opacity-20" />
                <p className="text-sm">Nenhuma campanha encontrada</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-accent/50 transition-colors group"
                  >
                    <button
                      onClick={() => setSelectedCampaignId(c.id)}
                      className="flex items-center gap-4 flex-1 min-w-0 text-left"
                    >
                      <div className="p-2 rounded-lg bg-secondary shrink-0">
                        {c.status === "scheduled" ? (
                          <CalendarClock className="w-4 h-4 text-amber-400" />
                        ) : (
                          <MessageSquare className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-foreground truncate">{c.name}</span>
                          {statusBadge(c.status)}
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-xs">{c.message}</p>
                        <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" /> {c.totalContacts} contatos
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(c.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                          {c.status === "scheduled" && c.scheduledAt && (
                            <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                              <CalendarClock className="w-3 h-3" />
                              Agendado para {format(new Date(c.scheduledAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </span>
                          )}
                          {c.status !== "scheduled" && c.status !== "cancelled" && (
                            <span className="flex items-center gap-1 text-xs text-emerald-400">
                              <TrendingUp className="w-3 h-3" /> {successRate(c)}% sucesso
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 w-24 hidden sm:block">
                        {c.status !== "scheduled" && c.status !== "cancelled" && (
                          <>
                            <Progress value={successRate(c)} className="h-1.5" />
                            <p className="text-xs text-muted-foreground text-right mt-1">{successRate(c)}%</p>
                          </>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>

                    {/* Cancel button for scheduled campaigns */}
                    {c.status === "scheduled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleCancel(e, c.id)}
                        disabled={cancellingId === c.id}
                        className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                      >
                        {cancellingId === c.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Ban className="w-3 h-3 mr-1" />
                            Cancelar
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Detail Dialog */}
      <Dialog open={!!selectedCampaignId} onOpenChange={(open) => !open && setSelectedCampaignId(null)}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              {campaignDetail?.name}
              {campaignDetail && statusBadge(campaignDetail.status)}
            </DialogTitle>
          </DialogHeader>

          {campaignDetail && (
            <div className="space-y-4 overflow-y-auto flex-1">
              {/* Scheduled info banner */}
              {campaignDetail.status === "scheduled" && campaignDetail.scheduledAt && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <CalendarClock className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">Disparo agendado</p>
                    <p className="text-xs text-amber-400/70">
                      Será enviado em {format(new Date(campaignDetail.scheduledAt), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      handleCancel(e, campaignDetail.id);
                      setSelectedCampaignId(null);
                    }}
                    disabled={cancellingId === campaignDetail.id}
                    className="ml-auto shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <Ban className="w-3 h-3 mr-1" />
                    Cancelar agendamento
                  </Button>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Total", value: campaignDetail.totalContacts, color: "text-foreground" },
                  { label: "Enviados", value: campaignDetail.sentCount, color: "text-primary" },
                  { label: "Sucesso", value: campaignDetail.successCount, color: "text-emerald-400" },
                  { label: "Erros", value: campaignDetail.errorCount, color: "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-lg bg-secondary text-center">
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {/* Message */}
              <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Mensagem</p>
                <p className="text-sm text-foreground">{campaignDetail.message}</p>
              </div>

              {/* Contact filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filtrar:</span>
                {["all", "sent", "failed", "pending"].map(f => (
                  <button
                    key={f}
                    onClick={() => setContactFilter(f)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      contactFilter === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? "Todos" : f === "sent" ? "Enviados" : f === "failed" ? "Erros" : "Pendentes"}
                  </button>
                ))}
              </div>

              {/* Contacts list */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {contacts?.map(contact => (
                  <div key={contact.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50">
                    {contactStatusIcon(contact.status)}
                    <span className="text-sm font-mono text-foreground">{contact.phone}</span>
                    {contact.errorMessage && (
                      <span className="text-xs text-red-400 truncate">{contact.errorMessage}</span>
                    )}
                    {contact.sentAt && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(contact.sentAt), "HH:mm:ss")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
