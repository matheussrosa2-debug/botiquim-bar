# 🍺 Botiquim Bar — Sistema de Cadastro e Fidelidade v2.0

Sistema completo de cadastro de clientes com roleta de prêmios, dashboard de gestão, WhatsApp automático, QR Code por evento, painel de aniversariantes e conformidade com a LGPD.

---

## Estrutura do projeto

```
botiquim-bar/
├── app/
│   ├── page.tsx                    → Cadastro do cliente (pública)
│   ├── privacidade/page.tsx        → Política de privacidade (LGPD)
│   ├── staff/page.tsx              → Portal do funcionário
│   ├── dashboard/page.tsx          → Dashboard do gestor (8 abas)
│   └── api/
│       ├── auth/                   → Login, logout, sessão, rate limiting
│       ├── codes/spin/             → Sorteio server-side (seguro)
│       ├── codes/validate/         → Validação de código
│       ├── codes/redeem/           → Resgate de código
│       ├── codes/qr/               → QR Code do código de prêmio
│       ├── customers/              → Cadastro, listagem paginada, busca
│       ├── customers/check/        → Verificação de CPF único
│       ├── customers/birthdays/    → Aniversariantes por período
│       ├── customers/gdpr/         → Exclusão de dados (LGPD)
│       ├── prizes/                 → CRUD prêmios com controle avançado
│       ├── events/                 → CRUD eventos
│       ├── events/[slug]/          → Evento por slug (para cadastro)
│       ├── events/[id]/qr/         → QR Code do evento
│       ├── dashboard/              → Estatísticas e gráficos
│       ├── export/                 → Exportação Excel com filtros
│       ├── config/                 → Configurações gerais
│       ├── whatsapp/config/        → Config Z-API e templates
│       ├── whatsapp/send/          → Envio manual
│       ├── whatsapp/logs/          → Histórico de envios
│       ├── whatsapp/test/          → Teste de envio
│       └── cron/birthday/          → CRON diário de aniversário
├── lib/
│   ├── supabase.ts                 → Cliente Supabase
│   ├── auth.ts                     → JWT, senhas, rate limiting
│   ├── spin.ts                     → Lógica de sorteio server-side
│   ├── whatsapp.ts                 → Cliente Z-API
│   └── utils.ts                    → CPF, máscaras, código, slugify
├── schema.sql                      → Schema inicial
├── migration_v2.sql                → Migração v2 (execute após schema.sql)
└── vercel.json                     → Configuração de CRON
```

---

## Passo a passo para colocar no ar

### 1. Supabase — banco de dados

1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. Vá em **SQL Editor → New query**
3. Cole e execute o `schema.sql`
4. Cole e execute o `migration_v2.sql`
5. Em **Settings → API**, copie:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public  → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role → `SUPABASE_SERVICE_ROLE_KEY`

### 2. GitHub — repositório

```bash
git init && git add . && git commit -m "Botiquim Bar v2"
git remote add origin https://github.com/SEU_USUARIO/botiquim-bar.git
git push -u origin main
```

### 3. Vercel — deploy

1. Acesse [vercel.com](https://vercel.com) → **Add New Project** → importe do GitHub
2. Em **Settings → Environment Variables**, adicione:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role |
| `JWT_SECRET` | String aleatória longa (mín. 32 chars) |
| `INITIAL_MANAGER_PASSWORD` | `gestor123` |
| `INITIAL_EMPLOYEE_PASSWORD` | `func123` |
| `CRON_SECRET` | String aleatória (ex: `openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | `https://seu-site.vercel.app` |

3. Clique em **Deploy**

---

## URLs do sistema

| URL | Descrição |
|---|---|
| `/` | Cadastro do cliente + roleta |
| `/?event=slug-do-evento` | Cadastro vinculado a um evento |
| `/privacidade` | Política de privacidade (LGPD) |
| `/staff` | Portal do funcionário |
| `/dashboard` | Dashboard do gestor |

---

## Acesso inicial

| Perfil | Senha | Onde |
|---|---|---|
| Gestor | `gestor123` | `/dashboard` |
| Funcionário | `func123` | `/staff` |

> ⚠️ Altere as senhas em Dashboard → Configurações → Senhas de acesso logo após o primeiro acesso.

---

## Funcionalidades v2

### Cadastro do cliente
- Verificação de CPF único antes do formulário
- Consentimento LGPD obrigatório + consentimento de marketing opcional
- Detecção automática de evento via URL `?event=slug`
- Banner do evento no cadastro
- **Sorteio server-side** (seguro — não pode ser manipulado pelo cliente)
- QR Code do prêmio exibido na tela de resultado
- Tela "já cadastrado" com QR Code do código anterior

### Roleta avançada
- Sorteio 100% no servidor (sem risco de fraude)
- Peso por prêmio (probabilidade configurável)
- **Tipos de limite:**
  - Sem limite
  - A cada X cadastros (ex: 1 a cada 500)
  - Máximo por período (dia / semana / mês)
  - Total absoluto
  - Horário específico (ex: das 18h às 22h)
- Prêmio alternativo quando o principal está indisponível
- **Tipos de validade:** horas, dias, somente hoje, data fixa
- Contadores: total emitido, hoje, semana, mês, último sorteio

### WhatsApp automático (Z-API)
- Mensagem de boas-vindas após cadastro (se consentiu)
- Mensagem de aniversário automática (CRON diário às 10h BRT)
- Templates editáveis pelo gestor com variáveis dinâmicas
- Log completo de envios (enviado / falhou)
- Botão de teste no dashboard
- Variáveis disponíveis: `{nome}`, `{primeiro_nome}`, `{premio}`, `{codigo}`, `{validade}`, `{bar_nome}`, `{dias_validade}`

### QR Code por evento
- Cada evento gera uma URL única: `/?event=festa-aniversario`
- QR Code personalizável (cor, fundo)
- Download em 3 tamanhos: 300px, 600px, 1200px
- Rastreia exatamente quantos cadastros vieram de cada evento

### Dashboard — 8 abas

| Aba | Conteúdo |
|---|---|
| Visão geral | Gráficos, estatísticas, exportação |
| Clientes | Tabela paginada com busca server-side |
| Códigos | Filtro por status, tipo e evento |
| Prêmios | Editor avançado com controle de disponibilidade |
| Eventos | CRUD + QR Code + URL de cadastro |
| Aniversariantes | Lista por hoje/semana/mês/mês específico |
| WhatsApp | Config Z-API, templates, logs |
| Configurações | Nome do bar, senhas, LGPD |

### Exportação Excel
Filtros: período de cadastro, mês de aniversário, prêmio, status do código, evento.
Colunas exportadas: nome, CPF, telefone, e-mail, aniversário, mês de aniversário, Instagram, evento de origem, prêmio, código, status, data de cadastro, data de resgate.

### LGPD
- Checkbox de consentimento obrigatório no cadastro
- Página `/privacidade` com política completa
- Rota de exclusão de dados (`DELETE /api/customers/gdpr`)
- Anonimização dos dados pessoais mantendo histórico estatístico

### Segurança
- Rate limiting no login (5 tentativas / 15 min por IP)
- Sorteio server-side (prêmio definido no servidor)
- Senhas armazenadas com fallback seguro
- Sessões JWT com expiração de 12h
- CRON protegido por secret

---

## WhatsApp — configuração Z-API

1. Acesse [z-api.io](https://z-api.io) e crie uma conta
2. Crie uma instância e conecte seu WhatsApp
3. Copie o **Instance ID** e o **Token**
4. No dashboard → aba WhatsApp → cole as credenciais → salve
5. Teste com seu número antes de ativar

**CRON de aniversário:** executado automaticamente todo dia às 10h (horário de Brasília) pelo Vercel. Busca aniversariantes do dia com consentimento de marketing, gera prêmio especial e envia WhatsApp. Também reseta os contadores diários dos prêmios.

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| Next.js 14 | Framework full-stack |
| Supabase | Banco PostgreSQL |
| Vercel | Hospedagem + CRON |
| Tailwind CSS | Estilização |
| Recharts | Gráficos |
| xlsx | Exportação Excel |
| qrcode | Geração de QR Codes |
| jose | JWT |
| date-fns | Datas |
| Z-API | WhatsApp |
