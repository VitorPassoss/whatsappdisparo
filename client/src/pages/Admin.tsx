import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Shield, Users, Coins, RefreshCw, Plus, Minus, Crown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

type UserRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  credits: number;
  createdAt: Date;
  lastSignedIn: Date;
};

export default function Admin() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Block non-admins: redirect immediately
  if (!loading && user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  // Show nothing while loading auth
  if (loading || !user) return null;

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery();

  const [editCreditsUser, setEditCreditsUser] = useState<UserRow | null>(null);
  const [creditsValue, setCreditsValue] = useState("");
  const [addMode, setAddMode] = useState<"set" | "add">("set");

  const setCreditsMutation = trpc.admin.setCredits.useMutation({
    onSuccess: () => {
      toast.success("Créditos atualizados com sucesso!");
      utils.admin.listUsers.invalidate();
      setEditCreditsUser(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const addCreditsMutation = trpc.admin.addCredits.useMutation({
    onSuccess: () => {
      toast.success("Créditos adicionados com sucesso!");
      utils.admin.listUsers.invalidate();
      setEditCreditsUser(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const setRoleMutation = trpc.admin.setRole.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Role atualizada para ${vars.role === "admin" ? "Admin" : "Usuário"}!`);
      utils.admin.listUsers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSaveCredits = () => {
    if (!editCreditsUser) return;
    const amount = parseInt(creditsValue);
    if (isNaN(amount) || amount < 0) {
      toast.error("Valor inválido");
      return;
    }
    if (addMode === "set") {
      setCreditsMutation.mutate({ userId: editCreditsUser.id, credits: amount });
    } else {
      addCreditsMutation.mutate({ userId: editCreditsUser.id, amount });
    }
  };

  const totalUsers = users?.length ?? 0;
  const totalCredits = users?.reduce((sum, u) => sum + u.credits, 0) ?? 0;
  const adminCount = users?.filter(u => u.role === "admin").length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "oklch(0.65 0.18 264 / 0.15)" }}>
            <Shield className="w-5 h-5" style={{ color: "oklch(0.75 0.18 264)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Painel Administrativo</h1>
            <p className="text-muted-foreground text-sm">Gerencie usuários, créditos e permissões</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total de Usuários</p>
                <p className="text-2xl font-bold text-foreground">{totalUsers}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/10">
                <Coins className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Créditos Distribuídos</p>
                <p className="text-2xl font-bold text-foreground">{totalCredits.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-yellow-500/10">
                <Crown className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Administradores</p>
                <p className="text-2xl font-bold text-foreground">{adminCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Usuários Cadastrados</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => utils.admin.listUsers.invalidate()}
                className="gap-2 text-muted-foreground"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando usuários...</div>
            ) : !users?.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground text-xs">Usuário</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Role</TableHead>
                      <TableHead className="text-muted-foreground text-xs text-center">Créditos</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Cadastro</TableHead>
                      <TableHead className="text-muted-foreground text-xs text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="border-border">
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-foreground">{u.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{u.email ?? "—"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.role === "admin" ? (
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs gap-1">
                              <Crown className="w-3 h-3" /> Admin
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Usuário</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm font-semibold ${
                            u.credits === 0 ? "text-red-400" : u.credits < 10 ? "text-yellow-400" : "text-emerald-400"
                          }`}>
                            {u.credits.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(u.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => {
                                setEditCreditsUser(u as UserRow);
                                setCreditsValue(String(u.credits));
                                setAddMode("set");
                              }}
                            >
                              <Coins className="w-3 h-3" />
                              Créditos
                            </Button>
                            {u.id !== user?.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-7 text-xs gap-1 ${
                                  u.role === "admin"
                                    ? "text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10"
                                    : "text-muted-foreground"
                                }`}
                                onClick={() =>
                                  setRoleMutation.mutate({
                                    userId: u.id,
                                    role: u.role === "admin" ? "user" : "admin",
                                  })
                                }
                                disabled={setRoleMutation.isPending}
                              >
                                <Crown className="w-3 h-3" />
                                {u.role === "admin" ? "Rebaixar" : "Promover"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Credits Dialog */}
      <Dialog open={!!editCreditsUser} onOpenChange={(o) => !o && setEditCreditsUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              Gerenciar Créditos
            </DialogTitle>
          </DialogHeader>
          {editCreditsUser && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{editCreditsUser.name ?? "Usuário"}</p>
                  <p className="text-xs text-muted-foreground">{editCreditsUser.email}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Créditos atuais</p>
                  <p className="text-lg font-bold text-primary">{editCreditsUser.credits.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={addMode === "set" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setAddMode("set")}
                >
                  Definir valor
                </Button>
                <Button
                  variant={addMode === "add" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setAddMode("add")}
                >
                  Adicionar
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  {addMode === "set" ? "Novo valor de créditos" : "Quantidade a adicionar"}
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setCreditsValue(String(Math.max(0, parseInt(creditsValue || "0") - 10)))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    value={creditsValue}
                    onChange={(e) => setCreditsValue(e.target.value)}
                    className="text-center"
                    placeholder="0"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setCreditsValue(String(parseInt(creditsValue || "0") + 10))}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[50, 100, 200, 500, 1000].map(v => (
                    <Button
                      key={v}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setCreditsValue(String(v))}
                    >
                      {addMode === "add" ? "+" : ""}{v}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCreditsUser(null)}>Cancelar</Button>
            <Button
              onClick={handleSaveCredits}
              disabled={setCreditsMutation.isPending || addCreditsMutation.isPending}
            >
              {setCreditsMutation.isPending || addCreditsMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
