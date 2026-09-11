# 🥤 Copos Místicos — Roguelike Arcade Web

Roguelike completo e jogável no navegador, baseado no clássico jogo de **encontrar bolinhas sob copos** (shell game). Memorize, acompanhe o embaralhamento, encontre **todas** as bolinhas e sobreviva o máximo de rodadas!

Sem dependências. Só **HTML + CSS + JavaScript vanilla**. Pronto para GitHub Pages.

![stack](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![stack](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![stack](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

---

## ▶️ Como rodar

### Opção 1 — Abrir direto (mais simples)
Baixe/clone o repositório e abra o `index.html` no navegador:

```bash
git clone https://github.com/SEU-USUARIO/copos-misticos.git
cd copos-misticos
# abra index.html com duplo clique, ou:
python3 -m http.server 8000
# acesse http://localhost:8000
```

### Opção 2 — GitHub Pages
1. Suba os arquivos para um repositório GitHub.
2. Vá em **Settings → Pages → Deploy from a branch → `main` / root**.
3. Acesse `https://SEU-USUARIO.github.io/copos-misticos/`.

---

## 🎮 Como jogar

1. **Memorize** — as bolinhas são reveladas por ~2 segundos.
2. **Acompanhe** — os copos fecham e embaralham cada vez mais rápido.
3. **Encontre TODAS as bolinhas** clicando nos copos.
   - Achou todas → próxima rodada + pontos + **1 carta de recompensa**.
   - Abriu 1 copo vazio → **GAME OVER**.
4. **Progressão roguelike:**
   - `+1 copo por rodada` (3 → 4 → 5 … até 10).
   - `+1 bolinha a cada 5 rodadas` (sempre em copos diferentes).
   - Velocidade, nº de movimentos e complexidade (trocas duplas, giros triplos, rotações) aumentam.
5. **Cartas** — ative na hora de adivinhar pelo deck (quantidade, nome, cor, ícone, descrição e botão USAR).

## 🃏 Cartas

| Carta | Efeito | Estratégia |
|---|---|---|
| 🔵 **Olho Aguçado** | Revela 1 bolinha por 1,2s | Aumenta moderadamente a chance de acerto |
| 🟡 **Copo Seguro** | Remove 1 copo vazio | Só funciona se houver copo sem bolinha |
| 🟢 **Duplicação** | Cria +2 bolinhas em copos válidos | Muito poderosa (+pontos), mas +risco (precisa achar todas) |

Após cada vitória você escolhe **1 de 3 ofertas aleatórias** para o deck.

## ⭐ Pontuação

- Multiplicador por vitórias consecutivas: `x1 → x1.2 → x1.4 → x1.6 …` (`1 + (rodada-1) × 0.2`).
- Fórmula por vitória: `(100 + (rodada-1)×25 + bolinhas×60 + cartasUsadas×30) × mult`.
- Uso estratégico de cartas dá bônus.
- Derrota reseta o multiplicador.
- **High score** salvo em `localStorage`.
- Game Over mostra: rodada, pontuação, recorde, mult máximo, cartas obtidas, bolinhas encontradas e deck final.

---

## 📁 Estrutura

```
.
├── index.html   # menu, jogo, HUD, arena, deck, recompensas, game over
├── style.css    # tema arcade escuro, copos, bolinhas, cartas, animações, responsivo
├── script.js    # lógica: rodadas, copos, bolinhas, aleatoriedade, dificuldade,
│                #         pontuação, cartas, deck, estados, partículas, áudio
└── README.md
```

Não há build, bundler ou assets externos obrigatórios (a fonte usa Google Fonts com fallback).

## ✨ Visual

- Tema arcade escuro neon, scanlines, orbes de brilho.
- Copos com gradiente e carinhas, bolinhas brilhantes com glow.
- Partículas em canvas (fundo + explosões de acerto/erro/vitória).
- Animações de acerto (bounce verde), erro (shake vermelho), recompensa (pop + confete).
- Sons sintetizados via WebAudio (sem arquivos), com botão mudo 🔊/🔇.
- Responsivo: desktop e celular (deck empilha, HUD adapta, copos com `clamp()`).

## 🧠 Detalhes de implementação

- **Estados:** `menu → show → hide → shuffle → guess → reward → … → over`.
- **Embaralhamento** com técnica FLIP (mede `getBoundingClientRect`, reordena o DOM, anima o `translate`), então funciona com quebra de linha no mobile.
- **Aleatoriedade:** `Math.random` + Fisher-Yates para bolinhas, pares de troca e ofertas de cartas.
- **Cancelamento seguro:** `shuffleToken` invalida loops antigos ao recomeçar/desistir.

## 🚀 Ideias futuras

- [ ] Modo infinito hard (11+ copos com scroll)
- [ ] Novas cartas (Congelar tempo, Segunda chance, Raio-X)
- [ ] Ranking online + sementes diárias
- [ ] Skins de copo desbloqueáveis

---

Feito com HTML + CSS + JS. Boa run! 🔮
