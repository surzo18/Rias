# Rias

![Rias Gremory](https://static.wikia.nocookie.net/highschooldxd/images/0/0f/Rias_Gremory_Anime.png)

Rias je open-source starter kit pre AI agent infra (Claude Code hooks, pravidla, audit workflow, dokumentacny workflow) s oddelenim na:

- verzovany default stav projektu (v gite)
- lokalny runtime stav (mimo gitu)

## Preco nazov Rias

Nazov je inspirovany postavou **Rias Gremory** z *High School DxD*.
Myslienka projektu: mat silny, jasne riadeny "core" pre agentov, ktory vies skopirovat ako starting point do dalsich projektov.

## Ciel projektu

- Rias je **obal/infrastruktura** projektu, nie business logika.
- projektove skills a aplikacna logika patria do `src/`.
- Runtime zapisy (logy, handovery, lokalna memoria) maju ostat lokalne.

## Quick Start

```bash
npm install
npm test
```

## Struktura

```text
tools/Rias/
|- .claude/
|  |- hooks/              # infrastruktura hookov
|  |- rules/              # projektove pravidla
|  |- skills/             # Claude Code workflow skills
|  |- audits/             # verzovany audit baseline
|  |- learnings/          # verzovane default sablony
|  `- local/              # lokalny runtime stav (gitignored)
|- src/
|  `- skills/             # projektove skills pre konkretny projekt
|- docs/skills/index.md
|- test/
|- README.md
|- CLAUDE.md
`- .gitignore
```

## Lokalny vs verzovany stav

Lokalne (necommitovat):
- `.claude/local/**` (hook log, token usage, handovers, runtime learnings, lokalny session counter, lokalne audity)

Verzovane (commitovat):
- `.claude/hooks/**`, `.claude/rules/**`, `.claude/skills/**`
- `.claude/audits/latest.json` (baseline)
- `.claude/learnings/*.md` (default sablony)
- `src/skills/**` (projektove skills)

## Audit workflow

- Audit sa spusta cez `/audit-infra`.
- Audit vytvara plan akcii, ulozi ho a pri dalsom behu kontroluje ci bol implementovany.
- Implementacia audit planu ide az po potvrdeni usera.

## Licencia

MIT (rovnaky open-source model ako Clawd Bot).
Pozri `LICENSE`.

## Poznamka k obrazku

Obrazok je externy odkaz na postavu, prava patria povodnym autorom/drzitelom IP.
