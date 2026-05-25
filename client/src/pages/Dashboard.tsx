import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Send, CheckCircle2, XCircle, Clock, BarChart3,
  TrendingUp, MessageSquare, Zap, ArrowRight, Plus, Coins
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function StatCard({
  title, value, icon: Icon, color, description
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  description?: string;
}) {
  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-all duration-200">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className={`p-3 rounded-xl bg-opacity-10 ${color.replace("text-", "bg-").replace("[", "[").replace("]", "]")}`}
            style={{ background: "oklch(from currentColor l c h / 0.1)" }}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: campaigns, isLoading: campaignsLoading } = trpc.campaigns.list.useQuery({});
  const { user } = useAuth();
  const credits = (user as { credits?: number } | null)?.credits ?? 0;

  const recentCampaigns = campaigns?.slice(0, 5) ?? [];

  const chartData = recentCampaigns.map(c => ({
    name: c.name.length > 12 ? c.name.slice(0, 12) + "…" : c.name,
    sucesso: c.successCount,
    erro: c.errorCount,
  })).reverse();

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-400";
      case "running": return "text-blue-400";
      case "failed": return "text-red-400";
      default: return "text-yellow-400";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Concluída";
      case "running": return "Enviando";
      case "failed": return "Falhou";
      default: return "Pendente";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão geral dos seus disparos via WhatsApp API
            </p>
          </div>
          <Button
            onClick={() => navigate("/dispatch")}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Zap className="w-4 h-4" />
            Novo Disparo
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Enviados"
            value={statsLoading ? "—" : (stats?.totalSent ?? 0).toLocaleString()}
            icon={Send}
            color="text-primary"
            description="Todos os disparos"
          />
          <StatCard
            title="Sucesso"
            value={statsLoading ? "—" : (stats?.totalSuccess ?? 0).toLocaleString()}
            icon={CheckCircle2}
            color="text-emerald-400"
            description="Mensagens entregues"
          />
          <StatCard
            title="Erros"
            value={statsLoading ? "—" : (stats?.totalErrors ?? 0).toLocaleString()}
            icon={XCircle}
            color="text-red-400"
            description="Falhas de envio"
          />
          <StatCard
            title="Pendentes"
            value={statsLoading ? "—" : (stats?.totalPending ?? 0).toLocaleString()}
            icon={Clock}
            color="text-yellow-400"
            description="Aguardando envio"
          />
        </div>

        {/* Credits Banner */}
        {user?.role !== "admin" && (
          <div className={`flex items-center justify-between px-5 py-3 rounded-xl border ${
            credits === 0
              ? "border-red-500/40 bg-red-500/10"
              : credits < 10
              ? "border-yellow-500/40 bg-yellow-500/10"
              : "border-primary/30 bg-primary/5"
          }`}>
            <div className="flex items-center gap-3">
              <Coins className={`w-5 h-5 ${
                credits === 0 ? "text-red-400" : credits < 10 ? "text-yellow-400" : "text-primary"
              }`} />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {credits === 0 ? "Sem créditos de disparo" : `${credits.toLocaleString()} crédito${credits !== 1 ? "s" : ""} disponível${credits !== 1 ? "is" : ""}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {credits === 0
                    ? "Entre em contato com o administrador para adquirir mais créditos."
                    : "1 crédito = 1 mensagem enviada com sucesso"}
                </p>
              </div>
            </div>
            {credits === 0 && (
              <Badge variant="destructive" className="text-xs">Bloqueado</Badge>
            )}
          </div>
        )}

        {/* Chart + Recent Campaigns */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Chart */}
          <Card className="lg:col-span-3 border-border overflow-hidden" style={{ background: "linear-gradient(135deg, oklch(0.14 0.012 264) 0%, oklch(0.11 0.008 264) 100%)" }}>
            <CardHeader className="pb-0 pt-5 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg" style={{ background: "oklch(0.65 0.18 142 / 0.15)" }}>
                    <TrendingUp className="w-4 h-4" style={{ color: "oklch(0.75 0.18 142)" }} />
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground">Desempenho das Campanhas</CardTitle>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: "oklch(0.65 0.18 142 / 0.12)", color: "oklch(0.75 0.18 142)" }}>
                  Últimas {recentCampaigns.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4 pt-2">
              {campaignsLoading ? (
                <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span>Carregando...</span>
                  </div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-52 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <div className="p-4 rounded-2xl" style={{ background: "oklch(0.65 0.18 142 / 0.08)" }}>
                    <BarChart3 className="w-8 h-8" style={{ color: "oklch(0.65 0.18 142 / 0.4)" }} />
                  </div>
                  <p className="text-sm">Nenhuma campanha ainda</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/dispatch")}
                    className="gap-1 text-xs border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Plus className="w-3 h-3" /> Criar campanha
                  </Button>
                </div>
              ) : (
                <>
                  <svg width="0" height="0" style={{ position: "absolute" }}>
                    <defs>
                      <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.75 0.18 142)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="oklch(0.75 0.18 142)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradError" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.65 0.22 22)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="oklch(0.65 0.22 22)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                  </svg>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#25D366" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#25D366" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.008 264)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "oklch(0.50 0.01 264)", fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                        dy={6}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "oklch(0.50 0.01 264)" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.13 0.01 264)",
                          border: "1px solid oklch(0.28 0.01 264)",
                          borderRadius: "12px",
                          fontSize: "12px",
                          color: "oklch(0.92 0.005 264)",
                          padding: "10px 14px",
                          boxShadow: "0 8px 32px oklch(0 0 0 / 0.5)",
                        }}
                        labelStyle={{ fontWeight: 700, marginBottom: 4, color: "oklch(0.92 0.005 264)" }}
                        cursor={{ stroke: "oklch(0.40 0.01 264)", strokeWidth: 1, strokeDasharray: "4 2" }}
                        formatter={(value: number, name: string) => [
                          <span style={{ fontWeight: 600 }}>{value.toLocaleString()}</span>,
                          name === "sucesso" ? "✅ Sucesso" : "❌ Erro",
                        ]}
                      />
                      <Legend
                        formatter={(value) => (
                          <span style={{ fontSize: 11, color: "oklch(0.60 0.01 264)", fontWeight: 500 }}>
                            {value === "sucesso" ? "Sucesso" : "Erro"}
                          </span>
                        )}
                        iconType="circle"
                        iconSize={8}
                      />
                      <Area
                        type="monotone"
                        dataKey="sucesso"
                        name="sucesso"
                        stroke="#25D366"
                        strokeWidth={2.5}
                        fill="url(#colorSuccess)"
                        dot={{ fill: "#25D366", strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: "#25D366", stroke: "oklch(0.13 0.01 264)", strokeWidth: 2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="erro"
                        name="erro"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        fill="url(#colorError)"
                        dot={{ fill: "#ef4444", strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: "#ef4444", stroke: "oklch(0.13 0.01 264)", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              )}
            </CardContent>
          </Card>

          {/* Recent Campaigns */}
          <Card className="lg:col-span-2 bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Campanhas Recentes
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7 px-2"
                  onClick={() => navigate("/history")}
                >
                  Ver todas <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {campaignsLoading ? (
                <div className="text-sm text-muted-foreground text-center py-8">Carregando...</div>
              ) : recentCampaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Nenhuma campanha</p>
                </div>
              ) : (
                recentCampaigns.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                    onClick={() => navigate("/history")}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.totalContacts} contatos · {format(new Date(c.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`ml-2 shrink-0 text-xs border-current ${statusColor(c.status)}`}
                    >
                      {statusLabel(c.status)}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Zap, label: "Novo Disparo", desc: "Enviar mensagem em massa", path: "/dispatch", color: "text-primary" },
            { icon: TrendingUp, label: "Histórico", desc: "Ver campanhas anteriores", path: "/history", color: "text-blue-400" },
            { icon: MessageSquare, label: "Listas de Contatos", desc: "Gerenciar seus contatos", path: "/contacts", color: "text-purple-400" },
          ].map(({ icon: Icon, label, desc, path, color }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-accent transition-all duration-200 text-left group"
            >
              <div className="p-2.5 rounded-lg bg-secondary">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
