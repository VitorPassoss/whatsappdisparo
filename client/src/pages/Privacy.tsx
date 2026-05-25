export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
          <p className="text-muted-foreground text-sm">Última atualização: abril de 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Introdução</h2>
            <p>
              O <strong className="text-foreground">WA Disparador</strong> ("nós", "nosso" ou "aplicativo") respeita a sua privacidade e está comprometido em proteger as informações pessoais que você compartilha conosco. Esta Política de Privacidade descreve como coletamos, usamos e protegemos suas informações ao utilizar nosso serviço de disparos via WhatsApp Business API Oficial da Meta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Informações que Coletamos</h2>
            <p>Ao utilizar nosso aplicativo, podemos coletar as seguintes informações:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>Nome e endereço de e-mail associados à sua conta Meta/Facebook</li>
              <li>Identificação do número de telefone WhatsApp Business (Phone Number ID)</li>
              <li>Token de acesso à API do WhatsApp Business</li>
              <li>Dados de campanhas de disparo (números de contato, mensagens enviadas, status de entrega)</li>
              <li>Listas de contatos criadas e gerenciadas dentro da plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Como Usamos suas Informações</h2>
            <p>As informações coletadas são utilizadas exclusivamente para:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>Autenticar e identificar sua conta na plataforma</li>
              <li>Realizar disparos de mensagens via WhatsApp Business API em seu nome</li>
              <li>Armazenar histórico de campanhas para consulta e análise</li>
              <li>Gerenciar listas de contatos cadastradas por você</li>
              <li>Melhorar a experiência e funcionalidades da plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Compartilhamento de Dados</h2>
            <p>
              Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros, exceto quando necessário para a operação do serviço (como a própria API da Meta/WhatsApp) ou quando exigido por lei.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Integração com a Meta (Facebook/WhatsApp)</h2>
            <p>
              Nosso aplicativo utiliza a API oficial do WhatsApp Business da Meta. Ao conectar sua conta via Facebook, você autoriza o acesso às permissões necessárias para o funcionamento do serviço. Você pode revogar esse acesso a qualquer momento nas configurações da sua conta Meta Business.
            </p>
            <p className="mt-2">
              Para mais informações sobre como a Meta trata seus dados, consulte a{" "}
              <a
                href="https://www.facebook.com/privacy/policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-500 hover:underline"
              >
                Política de Privacidade da Meta
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizacionais adequadas para proteger suas informações contra acesso não autorizado, alteração, divulgação ou destruição. Os tokens de acesso são armazenados de forma segura e nunca são expostos publicamente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Retenção de Dados</h2>
            <p>
              Mantemos seus dados enquanto sua conta estiver ativa. Você pode solicitar a exclusão de seus dados a qualquer momento entrando em contato conosco. Após a exclusão, os dados são removidos permanentemente de nossos servidores.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Seus Direitos</h2>
            <p>Você tem o direito de:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>Acessar as informações que temos sobre você</li>
              <li>Solicitar a correção de dados incorretos</li>
              <li>Solicitar a exclusão de seus dados</li>
              <li>Revogar o acesso do aplicativo à sua conta Meta a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Contato</h2>
            <p>
              Para dúvidas, solicitações ou exercício dos seus direitos relacionados a esta Política de Privacidade, entre em contato conosco pelo e-mail:{" "}
              <a href="mailto:eras3455@outlook.com" className="text-green-500 hover:underline">
                eras3455@outlook.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Alterações nesta Política</h2>
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre mudanças significativas através do próprio aplicativo. O uso continuado do serviço após as alterações constitui aceitação da nova política.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            © 2026 WA Disparador — API Oficial Meta WhatsApp Business
          </p>
        </div>
      </div>
    </div>
  );
}
