import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Zap, Plus, Trash2, Edit2, MessageSquare, Clock,
  ChevronDown, ChevronUp, AlertCircle, Bot, ArrowRight
} from "lucide-react";
import { toast } from "sonner";

type Step = { message: string; delaySeconds: number };
type TriggerType = "contains" | "exact" | "starts_with";

interface AutomationForm {
  sessionId: number | null;
  name: string;
  trigger: string;
  triggerType: TriggerType;
  steps: Step[];
}

const defaultForm = (): AutomationForm => ({
  sessionId: null,
  name: "",
  trigger: "",
  triggerType: "contains",
  steps: [{ message: "", delaySeconds: 0 }],
});

const triggerTypeLabel: Record<TriggerType, string> = {
  contains: "Contém",
  exact: "Igual a",
  starts_with: "Começa com",
};

export default function Automations() {
  const utils = trpc.useUtils();
  const { data: automations = [], isLoading } = trpc.automations.list.useQuery();
  const { data: sessions = [] } = trpc.sessions.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AutomationForm>(defaultForm());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const createMutation = trpc.automations.create.useMutation({
    onSuccess: () => {
      toast.success("Automação criada!", { description: "O funil está ativo e pronto para responder." });
      utils.automations.list.invalidate();
      setDialogOpen(false);
      setForm(defaultForm());
    },
    onError: (err) => toast.error("Erro ao criar", { description: err.message }),
  });

  const updateMutation = trpc.automations.update.useMutation({
    onSuccess: () => {
      toast.success("Automação atualizada!");
      utils.automations.list.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm());
    },
    onError: (err) => toast.error("Erro ao atualizar", { description: err.message }),
  });

  const deleteMutation = trpc.automations.delete.useMutation({
    onSuccess: () => {
      toast.success("Automação removida.");
      utils.automations.list.invalidate();
      setDeleteConfirmId(null);
    },
    onError: (err) => toast.error("Erro ao remover", { description: err.message }),
  });

  const toggleMutation = trpc.automations.toggleActive.useMutation({
    onSuccess: () => utils.automations.list.invalidate(),
    onError: (err) => toast.error("Erro ao alterar status", { description: err.message }),
  });

  function openCreate() {
    setEditId(null);
    setForm(defaultForm());
    setDialogOpen(true);
  }

  function openEdit(auto: typeof automations[0]) {
    setEditId(auto.id);
    setForm({
      sessionId: auto.sessionId,
      name: auto.name,
      trigger: auto.trigger,
      triggerType: auto.triggerType as TriggerType,
      steps: auto.steps.map((s) => ({ message: s.message, delaySeconds: s.delaySeconds })),
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.sessionId) return toast.error("Selecione uma sessão WhatsApp");
    if (!form.name.trim()) return toast.error("Informe um nome para a automação");
    if (!form.trigger.trim()) return toast.error("Informe a palavra-chave de gatilho");
    if (form.steps.some((s) => !s.message.trim())) return toast.error("Preencha todas as mensagens dos passos");

    if (editId) {
      const { sessionId: _sid, ...formWithoutSession } = form;
      updateMutation.mutate({ id: editId, ...formWithoutSession });
    } else {
      createMutation.mutate({ ...form, sessionId: form.sessionId! });
    }
  }

  function addStep() {
    setForm((f) => ({ ...f, steps: [...f.steps, { message: "", delaySeconds: 0 }] }));
  }

  function removeStep(i: number) {
    setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }));
  }

  function updateStep(i: number, field: keyof Step, value: string | number) {
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)),
    }));
  }

  const sessionName = (id: number) =>
    sessions.find((s) => s.id === id)?.name ?? `Sessão #${id}`;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="w-7 h-7 text-primary" />
              Automações
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure respostas automáticas e funis de mensagens por palavra-chave
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Automação
          </Button>
        </div>

        {/* Empty state */}
        {!isLoading && automations.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Nenhuma automação criada</h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                  Crie um funil de respostas automáticas. Quando alguém enviar "oi", o sistema responde automaticamente com sua sequência de mensagens.
                </p>
              </div>
              <Button onClick={openCreate} className="gap-2 mt-2">
                <Plus className="w-4 h-4" />
                Criar primeira automação
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Automations list */}
        <div className="space-y-3">
          {automations.map((auto) => (
            <Card key={auto.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${auto.isActive === "1" ? "bg-green-500/10" : "bg-muted"}`}>
                      <Zap className={`w-5 h-5 ${auto.isActive === "1" ? "text-green-500" : "text-muted-foreground"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{auto.name}</CardTitle>
                        <Badge variant={auto.isActive === "1" ? "default" : "secondary"} className="text-xs">
                          {auto.isActive === "1" ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{triggerTypeLabel[auto.triggerType as TriggerType]}: "{auto.trigger}"</span>
                        <span className="text-xs">·</span>
                        <span className="text-xs">{sessionName(auto.sessionId)}</span>
                        <span className="text-xs">·</span>
                        <span className="text-xs">{auto.steps.length} passo{auto.steps.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={auto.isActive === "1"}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: auto.id, isActive: checked ? "1" : "0" })
                      }
                    />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(auto)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(auto.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExpandedId(expandedId === auto.id ? null : auto.id)}
                    >
                      {expandedId === auto.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Steps preview */}
              {expandedId === auto.id && (
                <CardContent className="pt-0 pb-4">
                  <div className="border-t pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Sequência de mensagens</p>
                    <div className="space-y-2">
                      {auto.steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {i + 1}
                            </div>
                            {i < auto.steps.length - 1 && (
                              <div className="w-px h-4 bg-border mt-1" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="bg-muted rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words">
                              {step.message}
                            </div>
                            {step.delaySeconds > 0 && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                Aguarda {step.delaySeconds}s antes de enviar
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditId(null); setForm(defaultForm()); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              {editId ? "Editar Automação" : "Nova Automação"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Nome da automação</Label>
              <Input
                placeholder="Ex: Funil de Boas-vindas"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Session */}
            {!editId && (
              <div className="space-y-1.5">
                <Label>Sessão WhatsApp</Label>
                <Select
                  value={form.sessionId?.toString() ?? ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, sessionId: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a sessão..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Trigger */}
            <div className="space-y-1.5">
              <Label>Palavra-chave de gatilho</Label>
              <div className="flex gap-2">
                <Select
                  value={form.triggerType}
                  onValueChange={(v) => setForm((f) => ({ ...f, triggerType: v as TriggerType }))}
                >
                  <SelectTrigger className="w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contém</SelectItem>
                    <SelectItem value="exact">Igual a</SelectItem>
                    <SelectItem value="starts_with">Começa com</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder='Ex: "oi", "quero", "info"'
                  value={form.trigger}
                  onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {form.triggerType === "contains" && "A automação dispara quando a mensagem contém essa palavra (não diferencia maiúsculas/minúsculas)."}
                {form.triggerType === "exact" && "A automação dispara apenas quando a mensagem for exatamente igual ao gatilho."}
                {form.triggerType === "starts_with" && "A automação dispara quando a mensagem começa com o gatilho."}
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Sequência de mensagens</Label>
                <Button type="button" variant="outline" size="sm" onClick={addStep} className="gap-1 text-xs">
                  <Plus className="w-3 h-3" />
                  Adicionar passo
                </Button>
              </div>

              <div className="space-y-3">
                {form.steps.map((step, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Passo {i + 1}
                        {i > 0 && (
                          <span className="text-muted-foreground/60">
                            <ArrowRight className="w-3 h-3 inline" />
                          </span>
                        )}
                      </span>
                      {form.steps.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6"
                          onClick={() => removeStep(i)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>

                    <Textarea
                      placeholder="Digite a mensagem que será enviada..."
                      value={step.message}
                      onChange={(e) => updateStep(i, "message", e.target.value)}
                      rows={3}
                      className="text-sm resize-none"
                    />

                    {i > 0 && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">Aguardar</span>
                        <Input
                          type="number"
                          min={0}
                          max={3600}
                          value={step.delaySeconds}
                          onChange={(e) => updateStep(i, "delaySeconds", Number(e.target.value))}
                          className="w-20 h-7 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">segundos antes de enviar</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Cada contato receberá o funil apenas uma vez a cada 24 horas para evitar spam. Apenas uma automação é disparada por mensagem (a primeira que corresponder ao gatilho).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              {editId ? "Salvar alterações" : "Criar automação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover automação?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta ação é irreversível. A automação e todos os seus passos serão removidos permanentemente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
