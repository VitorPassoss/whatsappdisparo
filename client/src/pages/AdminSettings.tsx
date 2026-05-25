import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, Eye, EyeOff, AlertCircle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

type SettingKey =
  | "FACEBOOK_APP_ID"
  | "FACEBOOK_APP_SECRET"
  | "WHATSAPP_WEBHOOK_TOKEN"
  | "APP_ORIGIN"
  | "OWNER_OPEN_ID";

type FieldConfig = {
  key: SettingKey;
  label: string;
  description: string;
  placeholder?: string;
  secret?: boolean;
};

const FIELDS: FieldConfig[] = [
  {
    key: "APP_ORIGIN",
    label: "URL pública do app",
    description: "Usada para construir o redirect URI do OAuth do Facebook. Ex: https://painelapi.online",
    placeholder: "https://painelapi.online",
  },
  {
    key: "FACEBOOK_APP_ID",
    label: "Facebook App ID",
    description: "ID do seu Meta App. Encontre em developers.facebook.com → My Apps → App Settings → Basic.",
    placeholder: "123456789012345",
  },
  {
    key: "FACEBOOK_APP_SECRET",
    label: "Facebook App Secret",
    description: "Secret do seu Meta App. Mesma tela do App ID. NÃO compartilhe.",
    placeholder: "•••••••••••••••",
    secret: true,
  },
  {
    key: "WHATSAPP_WEBHOOK_TOKEN",
    label: "Verify Token do Webhook",
    description: "String aleatória que o Meta envia pra verificar o webhook. Use o mesmo valor aqui e no Meta App Dashboard.",
    placeholder: "•••••••••••••••",
    secret: true,
  },
  {
    key: "OWNER_OPEN_ID",
    label: "Owner Open ID (opcional)",
    description: "OpenId que é automaticamente promovido a admin no login. Em geral deixe vazio.",
    placeholder: "email:seu@email.com",
  },
];

export default function AdminSettings() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();

  if (!loading && user && user.role !== "admin") {
    navigate("/");
    return null;
  }
  if (loading || !user) return null;

  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.admin.listSettings.useQuery();
  const updateMutation = trpc.admin.updateSetting.useMutation({
    onSuccess: () => {
      utils.admin.listSettings.invalidate();
    },
  });

  // Estado local: valor atual digitado por campo
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null);

  // Sincroniza estado inicial com o que veio do servidor (uma única vez por load)
  useEffect(() => {
    if (!settings) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const s of settings) {
        if (next[s.key] === undefined) next[s.key] = s.value;
      }
      return next;
    });
  }, [settings]);

  const settingsByKey = useMemo(() => {
    const map: Record<string, { hasValue: boolean; masked: boolean; value: string }> = {};
    for (const s of settings ?? []) map[s.key] = s;
    return map;
  }, [settings]);

  const handleSave = async (key: SettingKey) => {
    const value = (values[key] ?? "").trim();
    if (!value) {
      toast.error("Valor não pode ser vazio. Use o limpar pra remover.");
      return;
    }
    setSavingKey(key);
    try {
      await updateMutation.mutateAsync({ key, value });
      toast.success(`${key} atualizado`);
      // Limpa o input de secrets pra não deixar o valor visível
      const field = FIELDS.find((f) => f.key === key);
      if (field?.secret) {
        setValues((prev) => ({ ...prev, [key]: "" }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSavingKey(null);
    }
  };

  const redirectUriPreview = (() => {
    const origin = (values.APP_ORIGIN ?? "").trim() || (settingsByKey.APP_ORIGIN?.value ?? "");
    if (!origin) return "https://<seu-dominio>/auth/facebook/callback";
    return `${origin.replace(/\/$/, "")}/auth/facebook/callback`;
  })();

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Configurações da Aplicação
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Edite as credenciais e o domínio público sem precisar abrir o servidor.
            As mudanças entram em vigor em até 30 segundos.
          </p>
        </div>

        {/* Banner com info do redirect URI */}
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-300">
              <ExternalLink className="w-4 h-4" />
              Redirect URI a configurar no Meta App
            </div>
            <code className="block bg-secondary/50 rounded px-3 py-2 text-xs font-mono text-foreground break-all">
              {redirectUriPreview}
            </code>
            <p className="text-xs text-muted-foreground">
              Cole isto em <strong>Meta App Dashboard → Facebook Login → Settings → Valid OAuth Redirect URIs</strong>.
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando configurações...
          </div>
        ) : (
          <div className="space-y-4">
            {FIELDS.map((field) => {
              const current = settingsByKey[field.key];
              const hasValue = current?.hasValue ?? false;
              const inputValue = values[field.key] ?? "";
              const isShown = showSecrets[field.key] ?? false;
              const isSaving = savingKey === field.key;

              return (
                <Card key={field.key} className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Label className="text-sm">{field.label}</Label>
                        {hasValue ? (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Configurado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Vazio
                          </Badge>
                        )}
                      </span>
                      <code className="text-[10px] font-mono text-muted-foreground">{field.key}</code>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={field.secret && !isShown ? "password" : "text"}
                          value={inputValue}
                          onChange={(e) =>
                            setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          placeholder={
                            field.secret && hasValue
                              ? "•••••••• (já configurado — digite pra substituir)"
                              : field.placeholder
                          }
                          disabled={isSaving}
                          className="bg-input border-border pr-10"
                        />
                        {field.secret && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowSecrets((prev) => ({ ...prev, [field.key]: !isShown }))
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {isShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                      <Button
                        onClick={() => handleSave(field.key)}
                        disabled={isSaving || !inputValue.trim()}
                        size="sm"
                        className="gap-1.5"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
