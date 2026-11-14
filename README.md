# ci-status-bar

Mostra, numa barra acima do prompt do Claude Code, o PR do branch atual e o progresso dos checks de CI do GitHub: quantos passaram, falharam e ainda estão rodando, com uma barra de progresso, os nomes dos checks que falharam e um aviso quando o CI termina.

Atualiza a cada 30 segundos e logo depois de `git push`, `git checkout`/`switch` ou `gh pr`. Também escreve um resumo curto na status line (ex.: `PR #12 CI ⏳ 3/6`).

Requer `git` e `gh` (autenticado) no ambiente da sessão. Procura o repositório no diretório da sessão ou em uma subpasta imediata dele.

## Instalação

No prompt de uma sessão do Claude Code:

```
/plugin install ci-status-bar --marketplace rodrigobispoeng-a11y/ci-status-bar
```

De um shell:

```
claude plugin install ci-status-bar --marketplace rodrigobispoeng-a11y/ci-status-bar
```

No app desktop: clique em + ao lado da caixa do prompt, depois Plugins, Add marketplace com `rodrigobispoeng-a11y/ci-status-bar`, e então Add plugin.

Se o repositório for privado, a instalação só funciona para quem tem acesso a ele no GitHub e uma credencial git configurada para github.com (`gh auth login` e depois `gh auth setup-git`).
