export default function Privacidade() {
  return (
    <main className="min-h-screen px-4 py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-zinc-900 mb-2">Política de Privacidade</h1>
      <p className="text-sm text-zinc-400 mb-8">Última atualização: abril de 2026</p>

      {[
        { title: "1. Quem somos", body: "O Botiquim Bar é o responsável pelo tratamento dos seus dados pessoais coletados por meio desta plataforma de cadastro, conforme a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)." },
        { title: "2. Dados coletados", body: "Coletamos nome completo, CPF, telefone, e-mail, data de nascimento e Instagram (opcional). Também registramos o evento de origem do cadastro e o consentimento para comunicações de marketing." },
        { title: "3. Finalidade do tratamento", body: "Seus dados são utilizados para: (a) realização do cadastro de fidelidade; (b) geração e controle de prêmios; (c) envio de comunicações via WhatsApp, caso você tenha dado consentimento; (d) envio de mensagem de aniversário com prêmio especial, se autorizado." },
        { title: "4. Base legal", body: "O tratamento é realizado com base no seu consentimento explícito (art. 7º, I da LGPD). O consentimento para comunicações de marketing é opcional e não prejudica o cadastro." },
        { title: "5. Compartilhamento de dados", body: "Seus dados não são vendidos nem compartilhados com terceiros para fins comerciais. Utilizamos o serviço Z-API exclusivamente para envio de mensagens via WhatsApp autorizadas por você, e o Supabase como banco de dados seguro." },
        { title: "6. Prazo de retenção", body: "Seus dados são mantidos enquanto você for cliente ativo. Mediante solicitação, os dados pessoais identificáveis são removidos no prazo de 30 dias, mantendo-se apenas registros estatísticos anônimos." },
        { title: "7. Seus direitos (LGPD)", body: "Você tem direito a: confirmar a existência de tratamento; acessar seus dados; corrigir dados incompletos ou incorretos; solicitar a exclusão dos dados; revogar o consentimento a qualquer momento; solicitar informações sobre compartilhamento." },
        { title: "8. Como exercer seus direitos", body: "Entre em contato pelo e-mail informado no estabelecimento ou solicite ao atendente. Responderemos em até 15 dias úteis." },
        { title: "9. Segurança", body: "Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo armazenamento criptografado e acesso restrito por autenticação segura." },
        { title: "10. Alterações nesta política", body: "Esta política pode ser atualizada periodicamente. A versão mais recente estará sempre disponível nesta página." },
      ].map(s => (
        <section key={s.title} className="mb-6">
          <h2 className="font-semibold text-zinc-800 mb-2">{s.title}</h2>
          <p className="text-sm text-zinc-600 leading-relaxed">{s.body}</p>
        </section>
      ))}

      <div className="mt-8 pt-6 border-t border-zinc-200">
        <a href="/" className="text-sm text-orange-600 underline underline-offset-2">← Voltar ao cadastro</a>
      </div>
    </main>
  );
}
