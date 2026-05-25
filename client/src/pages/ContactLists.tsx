import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users, Plus, Trash2, Edit2, Phone,
  Search, X, UserPlus, List, RefreshCw,
  Upload, FileText, FileSpreadsheet, CheckCircle2, RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

function extractPhonesFromText(raw: string): string[] {
  return raw
    .split(/[\n,;\r\t]+/)
    .map(s => s.trim().replace(/\D/g, ""))
    .filter(s => s.length >= 8);
}

async function readFileAsPhones(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          const phones: string[] = [];
          for (const row of rows) {
            for (const cell of row) {
              const val = String(cell ?? "").trim().replace(/\D/g, "");
              if (val.length >= 8) phones.push(val);
            }
          }
          resolve(phones);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(extractPhonesFromText(e.target!.result as string));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export default function ContactLists() {
  const [newListName, setNewListName] = useState("");
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  // Dialog state
  const [addToListId, setAddToListId] = useState<string>("");
  const [loadedPhones, setLoadedPhones] = useState<string[]>([]); // phones from file
  const [manualRaw, setManualRaw] = useState(""); // manual textarea (hidden when file loaded)
  const [fileName, setFileName] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showManual, setShowManual] = useState(false); // toggle manual input
  const [loadingFile, setLoadingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");
  const [searchContacts, setSearchContacts] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: lists, isLoading } = trpc.contactLists.list.useQuery();
  const { data: contacts } = trpc.contactLists.getContacts.useQuery(
    { listId: selectedListId! },
    { enabled: !!selectedListId }
  );

  const selectedList = lists?.find(l => l.id === selectedListId);

  const createMutation = trpc.contactLists.create.useMutation({
    onSuccess: () => {
      utils.contactLists.list.invalidate();
      setNewListName("");
      setShowCreateDialog(false);
      toast.success("Lista criada com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  const renameMutation = trpc.contactLists.rename.useMutation({
    onSuccess: () => {
      utils.contactLists.list.invalidate();
      setRenameId(null);
      toast.success("Lista renomeada!");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.contactLists.delete.useMutation({
    onSuccess: () => {
      utils.contactLists.list.invalidate();
      if (selectedListId) setSelectedListId(null);
      toast.success("Lista removida!");
    },
    onError: (err) => toast.error(err.message),
  });

  const addContactsMutation = trpc.contactLists.addContacts.useMutation({
    onSuccess: (data) => {
      const targetId = parseInt(addToListId);
      utils.contactLists.getContacts.invalidate({ listId: targetId });
      utils.contactLists.list.invalidate();
      resetDialog();
      setShowAddDialog(false);
      toast.success(`${data.count} número${data.count !== 1 ? "s" : ""} adicionado${data.count !== 1 ? "s" : ""}!`);
      setSelectedListId(targetId);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeContactMutation = trpc.contactLists.removeContact.useMutation({
    onSuccess: () => {
      utils.contactLists.getContacts.invalidate({ listId: selectedListId! });
      toast.success("Contato removido!");
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredContacts = contacts?.filter(c =>
    !searchContacts || c.phone.includes(searchContacts) || c.name?.toLowerCase().includes(searchContacts.toLowerCase())
  );

  const resetDialog = () => {
    setLoadedPhones([]);
    setManualRaw("");
    setFileName(null);
    setShowManual(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openAddDialog = () => {
    resetDialog();
    if (selectedListId) setAddToListId(String(selectedListId));
    else if (lists && lists.length > 0) setAddToListId(String(lists[0].id));
    else setAddToListId("");
    setShowAddDialog(true);
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setLoadingFile(true);
    setShowManual(false);
    try {
      const phones = await readFileAsPhones(file);
      if (!phones.length) {
        toast.error("Nenhum número encontrado no arquivo.");
      } else {
        setLoadedPhones(phones);
        setManualRaw("");
        setFileName(file.name);
      }
    } catch {
      toast.error("Erro ao ler o arquivo. Verifique o formato.");
    } finally {
      setLoadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // What will actually be sent
  const phonesToSend = loadedPhones.length > 0
    ? loadedPhones.join("\n")
    : manualRaw;

  const phoneCount = loadedPhones.length > 0
    ? loadedPhones.length
    : manualRaw.split("\n").filter(l => l.trim().replace(/\D/g, "").length >= 8).length;

  const handleAddContacts = () => {
    const targetId = parseInt(addToListId);
    if (!targetId || !phonesToSend.trim()) return;
    addContactsMutation.mutate({ listId: targetId, rawPhones: phonesToSend });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Listas de Contatos</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie suas listas para reutilizar em campanhas
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={openAddDialog} variant="outline" className="gap-2 border-border">
              <UserPlus className="w-4 h-4" />
              Adicionar Números
            </Button>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Nova Lista
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lists */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <List className="w-4 h-4 text-primary" />
                Suas Listas
                {lists && <Badge variant="outline" className="ml-auto text-xs">{lists.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />Carregando...
                </div>
              ) : !lists || lists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Users className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Nenhuma lista criada</p>
                  <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1 text-xs">
                    <Plus className="w-3 h-3" /> Criar lista
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {lists.map(list => (
                    <div
                      key={list.id}
                      onClick={() => setSelectedListId(list.id)}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group ${
                        selectedListId === list.id
                          ? "bg-primary/10 border-l-2 border-primary"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="p-2 rounded-lg bg-secondary shrink-0">
                        <Users className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{list.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(list.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenameId(list.id); setRenameName(list.name); }}
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Remover lista "${list.name}"?`)) deleteMutation.mutate({ id: list.id });
                          }}
                          className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contacts panel */}
          <Card className="lg:col-span-2 bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  {selectedList ? selectedList.name : "Selecione uma lista"}
                  {contacts && <Badge variant="outline" className="text-xs">{contacts.length} contatos</Badge>}
                </CardTitle>
                {selectedListId && (
                  <Button size="sm" onClick={openAddDialog} className="gap-1.5 text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90">
                    <UserPlus className="w-3.5 h-3.5" />Adicionar
                  </Button>
                )}
              </div>
              {selectedListId && (
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar número ou nome..."
                    value={searchContacts}
                    onChange={e => setSearchContacts(e.target.value)}
                    className="pl-9 h-8 text-xs bg-input border-border"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {!selectedListId ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Users className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Selecione uma lista para ver os contatos</p>
                </div>
              ) : !filteredContacts || filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Phone className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Nenhum contato nesta lista</p>
                  <Button variant="outline" size="sm" onClick={openAddDialog} className="gap-1 text-xs">
                    <Plus className="w-3 h-3" /> Adicionar contatos
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                  {filteredContacts.map(contact => (
                    <div key={contact.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 group">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Phone className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-foreground">{contact.phone}</p>
                        {contact.name && <p className="text-xs text-muted-foreground">{contact.name}</p>}
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Remover ${contact.phone}?`)) removeContactMutation.mutate({ contactId: contact.id });
                        }}
                        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create List Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />Nova Lista de Contatos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nome da lista</Label>
            <Input
              placeholder="Ex: Clientes VIP, Leads Quentes..."
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              className="bg-input border-border"
              onKeyDown={e => e.key === "Enter" && createMutation.mutate({ name: newListName })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate({ name: newListName })}
              disabled={!newListName.trim() || createMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {createMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Criar Lista"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contacts Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) resetDialog(); setShowAddDialog(open); }}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Adicionar Contatos
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* List selector */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Salvar na lista</Label>
              {lists && lists.length > 0 ? (
                <Select value={addToListId} onValueChange={setAddToListId}>
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue placeholder="Selecione uma lista..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {lists.map(list => (
                      <SelectItem key={list.id} value={String(list.id)}>{list.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400">Nenhuma lista criada.</p>
                  <Button size="sm" variant="outline" className="ml-auto text-xs h-7 shrink-0"
                    onClick={() => { setShowAddDialog(false); setShowCreateDialog(true); }}>
                    <Plus className="w-3 h-3 mr-1" /> Criar
                  </Button>
                </div>
              )}
            </div>

            {/* File loaded summary OR upload area */}
            {loadedPhones.length > 0 ? (
              /* ── Summary card after file loaded ── */
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-4">
                <CheckCircle2 className="w-8 h-8 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {loadedPhones.length.toLocaleString("pt-BR")} números prontos
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{fileName}</p>
                </div>
                <button
                  onClick={() => { resetDialog(); }}
                  className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                  title="Trocar arquivo"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* ── Upload area ── */
              <div className="space-y-3">
                <div
                  className={`relative border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
                    isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/20"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleFileChange(e.dataTransfer.files[0] ?? null);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv,.xlsx,.xls,.ods"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  />
                  {loadingFile ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Lendo arquivo...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <div className="flex gap-3 mb-1">
                        <FileText className="w-5 h-5" />
                        <FileSpreadsheet className="w-5 h-5" />
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Clique ou arraste um arquivo</p>
                      <p className="text-xs">TXT, CSV, Excel (.xlsx, .xls)</p>
                    </div>
                  )}
                </div>

                {/* Manual input toggle */}
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  onClick={() => setShowManual(v => !v)}
                >
                  {showManual ? "Ocultar entrada manual" : "Ou digitar/colar números manualmente"}
                </button>

                {showManual && (
                  <textarea
                    placeholder={"5511999999999\n5521988888888\n5531977777777"}
                    value={manualRaw}
                    onChange={e => setManualRaw(e.target.value)}
                    rows={5}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { resetDialog(); setShowAddDialog(false); }}>Cancelar</Button>
            <Button
              onClick={handleAddContacts}
              disabled={!phonesToSend.trim() || !addToListId || addContactsMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[120px]"
            >
              {addContactsMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Adicionando...</>
              ) : (
                phoneCount > 0
                  ? `Confirmar ${phoneCount.toLocaleString("pt-BR")} número${phoneCount !== 1 ? "s" : ""}`
                  : "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameId} onOpenChange={(open) => !open && setRenameId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />Renomear Lista
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Novo nome</Label>
            <Input
              value={renameName}
              onChange={e => setRenameName(e.target.value)}
              className="bg-input border-border"
              onKeyDown={e => e.key === "Enter" && renameMutation.mutate({ id: renameId!, name: renameName })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)}>Cancelar</Button>
            <Button
              onClick={() => renameMutation.mutate({ id: renameId!, name: renameName })}
              disabled={!renameName.trim() || renameMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {renameMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
