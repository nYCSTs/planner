This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy no Cloudflare

O app é uma SPA local-first: os dados ficam no IndexedDB de cada navegador e o app
funciona offline. O build usa `output: "export"` e o resultado estático em `out/` é
servido pelo mesmo Worker (`worker/index.ts`) que expõe a API de sincronização em
`/api/*`, gravando num banco **D1**. A configuração fica em `wrangler.jsonc`.

Requer **Node.js 22+** (exigência do Wrangler).

### Primeira vez

```bash
# login na sua conta Cloudflare
npx wrangler login

# cria o banco D1 e mostra o database_id
npx wrangler d1 create planner
```

Cole o `database_id` impresso em `wrangler.jsonc` (no lugar dos zeros) e então:

```bash
# cria as tabelas no D1 remoto
npm run db:migrate

# chave VAPID para as notificações push (cole a saída quando o wrangler pedir)
node scripts/vapid.mjs
npx wrangler secret put VAPID_JWK
```

`MAX_VAULTS` (em `wrangler.jsonc`, padrão `1`) impede que outras pessoas criem cofres
na sua API pública; use `0` para não limitar.

Troque também `VAPID_SUBJECT` em `wrangler.jsonc` por um `mailto:` seu (os serviços
de push usam esse contato). Sem a chave VAPID tudo funciona, só não há avisos com o
app fechado.

### Publicar

```bash
# build + servidor local em http://localhost:8787 para conferir antes de subir
npm run preview

# build + publicação
npm run deploy
```

Após o primeiro deploy o app fica em `https://planner.<seu-subdominio>.workers.dev`.
Para usar domínio próprio, adicione uma rota em `wrangler.jsonc` ou configure em
Workers & Pages → planner → Settings → Domains & Routes.

### Sincronização

Não há conta nem senha. Em **Configurações → Sincronizar**, um aparelho cria um
cofre e os outros entram lendo o QR code (ou digitando o código), que vale por 10
minutos e uma única vez. Cada aparelho recebe um token próprio, que pode ser
revogado na lista de aparelhos. O código de recuperação, mostrado uma vez ao criar o
cofre, recupera os dados se todos os aparelhos se perderem.

O cron do Worker (a cada minuto) calcula os avisos do dia no fuso do usuário e envia
push para os aparelhos que ativaram "Avisar com o app fechado". No iPhone isso exige
o app instalado na Tela de Início.

### Desenvolvimento

```bash
# app (http://localhost:9999)
npm run dev

# API + D1 local (http://localhost:8787); na primeira vez: npm run db:migrate:local
npm run dev:api
```

Para o `npm run dev` falar com a API local, rode-o com
`NEXT_PUBLIC_API_BASE=http://localhost:8787`. Para testar push localmente, crie
`.dev.vars` com `VAPID_JWK=<saída do scripts/vapid.mjs>`. `npm run typecheck`
verifica o app e o Worker.
