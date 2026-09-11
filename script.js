/* ============================================================================
   COPOS MÍSTICOS — Roguelike web (JavaScript vanilla, sem dependências)
   ----------------------------------------------------------------------------
   COMO O JOGO FUNCIONA (resumo):
   - Cada rodada sorteia copos e esconde bolinhas em copos diferentes.
   - O jogo mostra as bolinhas por alguns segundos, esconde e embaralha.
   - O jogador clica nos copos tentando achar TODAS as bolinhas.
   - Acertou tudo → ganha pontos + escolhe 1 carta de recompensa.
   - Errou um copo vazio → GAME OVER (o multiplicador zera na próxima run).
   ----------------------------------------------------------------------------
   SEÇÕES DESTE ARQUIVO:
     1. Config & Cartas .... regras de progressão e definição das 3 cartas
     2. Estado global ....... objeto S com tudo da partida atual
     3. Áudio ............... sons sintetizados via WebAudio (sem arquivos)
     4. Partículas .......... canvas de fundo + explosões de confete
     5. Utilidades .......... atalhos de DOM, espera, sorteio e avisos (toast)
     6. Dificuldade ......... fórmulas que crescem com a rodada
     7. Fluxo do jogo ....... telas e fases: show → hide → shuffle → guess
     8. Render + FLIP ....... desenha os copos e anima as trocas de posição
     9. Cartas / Deck ....... efeitos do Olho, Seguro e Duplicação
    10. Pontuação ........... multiplicador, high score no localStorage
    11. Recompensa/GameOver . modal de carta e tela de derrota
    12. Bindings + Boot .... liga os botões e inicia o jogo no menu
   ========================================================================== */

/* Ativa o "modo estrito": proíbe variáveis não declaradas e outros erros
   silenciosos, deixando bugs mais fáceis de achar. */
'use strict';

/* ================= 1. CONFIG & CARTAS ================= */

/* CONFIG guarda todas as regras de progressão num lugar só, para balancear
   o jogo mudando números aqui em vez de caçar valores espalhados no código. */
const CONFIG = {
  baseCups: 3,          // quantidade de copos na rodada 1
  cupsPerRound: 1,      // quantos copos novos entram a cada rodada (+1)
  maxCups: 10,          // teto de copos (para caber na tela do celular e PC)
  baseBalls: 1,         // bolinhas na rodada 1
  ballEveryNRounds: 5,  // a cada 5 rodadas entra +1 bolinha
  maxBaseBalls: 4,      // teto de bolinhas do sorteio base (sem contar Duplicação)
  maxMoves: 30,         // teto de movimentos do embaralhamento por rodada
  showTimeBase: 2100,   // ms que as bolinhas ficam visíveis (diminui por rodada)
  olhoRevealMs: 600,    // TEMPO do Olho Aguçado: revela 1 bolinha por 0,6s
  maxHighKey: 'coposMisticosHigh_v1', // chave do recorde no localStorage
};

/* CARDS descreve as 3 cartas do jogo. Cada carta tem id (chave do deck),
   nome exibido, ícone emoji, cor do tema (classe CSS) e descrição. */
const CARDS = {
  olho: {
    id: 'olho', nome: 'Olho Aguçado', icone: '🔵', cor: 'blue',
    desc: 'Revela 1 bolinha por 0,6s. Aumenta moderadamente a chance de acerto.',
  },
  seguro: {
    id: 'seguro', nome: 'Copo Seguro', icone: '🟡', cor: 'yellow',
    desc: 'Remove 1 copo vazio do tabuleiro. Só funciona se houver copo sem bolinha.',
  },
  duplicacao: {
    id: 'duplicacao', nome: 'Duplicação', icone: '🟢', cor: 'green',
    desc: 'Cria +2 bolinhas em copos vazios. Muito poderosa: +pontos, mas +risco!',
  },
};
/* CARD_IDS é a lista ['olho','seguro','duplicacao'], usada nos sorteios. */
const CARD_IDS = Object.keys(CARDS);

/* Caminhos das imagens dos copos e bolinhas (pasta img/ do repositório). */
const CUP_IMG = 'img/images__6_-removebg-preview.png'; // foto do copo vermelho
const BALL_IMG = 'img/istockphoto-1341244428-612x612-removebg-preview.png'; // foto da bolinha

/* ================= 2. ESTADO GLOBAL ================= */

/* S ("state") é o objeto único com TUDO da partida atual: tela, fase,
   rodada, pontos, copos, deck etc. Todas as funções leem e atualizam S. */
const S = {
  screen: 'menu',          // qual tela está visível: 'menu' | 'game' | 'over'
  phase: 'idle',           // fase da rodada: show|hide|shuffle|guess|reward|over
  round: 1,                // rodada atual (começa em 1)
  score: 0,                // pontuação acumulada na run atual
  high: 0,                 // recorde salvo (carregado do localStorage)
  maxMult: 1,              // maior multiplicador atingido (estatística final)
  numCups: 3,              // nº de copos da rodada atual
  numBalls: 1,             // nº de bolinhas a encontrar na rodada atual
  cups: [],                // lista de copos: {id, hasBall, eliminated, found, el}
  foundCount: 0,           // quantas bolinhas já foram achadas nesta rodada
  totalBallsFound: 0,      // total de bolinhas achadas na run (estatística)
  deck: { olho: 0, seguro: 0, duplicacao: 0 }, // quantidades de cada carta
  cardsObtained: 0,        // quantas cartas foram ganhas (estatística)
  cardsUsedThisRound: new Set(), // cartas usadas nesta rodada (dão bônus)
  muted: false,            // som desligado? (botão 🔊/🔇)
  shuffleToken: 0,         // nº que invalida embaralhamentos antigos ao recomeçar
  busy: false,             // trava cliques duplos enquanto revela um copo
};

/* ================= 3. ÁUDIO (WebAudio synth) ================= */

/* audioCtx é o contexto de áudio do navegador, criado sob demanda (só depois
   de um clique, pois navegadores bloqueiam som antes de interação). */
let audioCtx = null;
/* ac() cria (ou reaproveita) o contexto de áudio e o retoma se pausado. */
function ac() {
  // Se ainda não existe, tenta criar (com fallback para Safari antigo).
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  // Se o navegador suspendeu o áudio, manda continuar.
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
/* beep() toca UMA nota sintetizada: frequência (Hz), duração (s), forma da
   onda, volume e atraso. É a base de todos os efeitos sonoros. */
function beep(freq = 440, dur = 0.12, type = 'square', vol = 0.12, when = 0) {
  if (S.muted) return;                 // respeita o botão de mudo
  const ctx = ac(); if (!ctx) return;  // sem áudio disponível, sai quieto
  const t = ctx.currentTime + when;    // instante exato da nota (permite sequências)
  const o = ctx.createOscillator(), g = ctx.createGain(); // oscilador = tom; gain = volume
  o.type = type; o.frequency.setValueAtTime(freq, t);     // define tom e timbre
  g.gain.setValueAtTime(vol, t);                          // volume inicial
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);    // some suave (sem estalo)
  o.connect(g); g.connect(ctx.destination);               // liga: tom → volume → alto-falante
  o.start(t); o.stop(t + dur + 0.02);                     // toca e para a nota
}
/* sfx reúne todos os efeitos sonoros nomeados, cada um é uma combinação
   de beeps (arpejos para vitória, graves para erro etc.). */
const sfx = {
  click: () => beep(600, 0.07, 'square', 0.08),              // clique genérico em botão
  tick: () => beep(300 + Math.random() * 500, 0.05, 'square', 0.06), // tique agudo aleatório
  reveal: () => { beep(520, 0.1, 'sine', 0.12); beep(780, 0.12, 'sine', 0.1, 0.09); }, // mostra bolinhas
  correct: () => { beep(660, 0.1, 'sine', 0.14); beep(880, 0.14, 'sine', 0.14, 0.1); beep(1320, 0.2, 'sine', 0.1, 0.2); }, // acertou (arpejo subindo)
  wrong: () => { beep(220, 0.25, 'sawtooth', 0.14); beep(140, 0.4, 'sawtooth', 0.14, 0.15); }, // errou (ronco grave)
  win: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, 0.16, 'triangle', 0.13, i * 0.09)); }, // vitória (escala dó→mi)
  card: () => { beep(880, 0.09, 'triangle', 0.12); beep(1174, 0.14, 'triangle', 0.12, 0.08); }, // ganhou/usou carta
  swap: () => beep(240 + Math.random() * 320, 0.06, 'triangle', 0.07), // cada troca do embaralhamento
  newRecord: () => { [784, 988, 1175, 1568, 2093].forEach((f, i) => beep(f, 0.2, 'sine', 0.13, i * 0.11)); }, // fanfarra de recorde
};

/* ================= 4. PARTÍCULAS ================= */

/* bgCanvas é o <canvas> fixo atrás de tudo; bctx é o pincel 2D dele. */
const bgCanvas = document.getElementById('bg-particles');
const bctx = bgCanvas.getContext('2d');
/* stars = poeira neon flutuando no fundo; bursts = explosões temporárias. */
let stars = [], bursts = [];
/* sizeCanvas() ajusta o canvas ao tamanho da janela e cria as estrelinhas
   com posição, tamanho, velocidade, cor e transparência aleatórias. */
function sizeCanvas() {
  bgCanvas.width = innerWidth; bgCanvas.height = innerHeight; // canvas ocupa a tela toda
  // Cria ~1 estrela a cada 10px de largura (máx 110 para não pesar).
  stars = Array.from({ length: Math.min(110, innerWidth / 10) }, () => ({
    x: Math.random() * bgCanvas.width, y: Math.random() * bgCanvas.height, // posição inicial
    r: Math.random() * 2 + 0.4, s: Math.random() * 0.5 + 0.15,             // raio e velocidade de queda
    c: ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24'][Math.floor(Math.random() * 4)], // cor neon
    a: Math.random() * 0.7 + 0.2, // transparência
  }));
}
/* burst() cria uma explosão de n partículas coloridas num ponto (x,y),
   voando para todas as direções com a força "power". */
function burst(x, y, colors, n = 26, power = 5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * power + 1.5; // ângulo e velocidade
    // Cada partícula tem velocidade, vida (1→0), tamanho e cor alternada.
    bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 1, r: Math.random() * 3.5 + 1.5, c: colors[i % colors.length] });
  }
}
/* confettiScreen() é o confete grande no centro da tela (vitórias). */
function confettiScreen(n = 80) { burst(innerWidth / 2, innerHeight * 0.35, ['#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'], n, 7); }
/* loopParticles() redesenha fundo + explosões a cada frame (~60fps). */
function loopParticles() {
  bctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height); // apaga o frame anterior
  // Desenha e faz cada estrela cair devagar; quem sai embaixo volta em cima.
  for (const st of stars) {
    st.y += st.s; if (st.y > bgCanvas.height) { st.y = -4; st.x = Math.random() * bgCanvas.width; }
    bctx.globalAlpha = st.a; bctx.fillStyle = st.c;
    bctx.beginPath(); bctx.arc(st.x, st.y, st.r, 0, 7); bctx.fill();
  }
  bctx.globalAlpha = 1; // volta a opacidade total
  bursts = bursts.filter(p => p.life > 0); // remove partículas já apagadas
  // Move cada partícula (com gravidade e atrito), encolhe e apaga com a vida.
  for (const p of bursts) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.985; p.life -= 0.016;
    bctx.globalAlpha = Math.max(0, p.life); bctx.fillStyle = p.c;
    bctx.beginPath(); bctx.arc(p.x, p.y, p.r * p.life + 0.4, 0, 7); bctx.fill();
  }
  bctx.globalAlpha = 1;
  requestAnimationFrame(loopParticles); // agenda o próximo frame (loop infinito)
}

/* ================= 5. UTILIDADES ================= */

/* $() é um atalho para document.getElementById — $('hud-score') em vez de
   document.getElementById('hud-score'). */
const $ = (id) => document.getElementById(id);
/* sleep() pausa uma função async por ms milissegundos (ex: await sleep(500)). */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/* rand(n) sorteia um inteiro de 0 até n-1 (ex: rand(3) → 0, 1 ou 2). */
const rand = (n) => Math.floor(Math.random() * n);
/* shuffleArr() embaralha um array no lugar (algoritmo Fisher-Yates) e o devolve. */
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/* toast() mostra um aviso flutuante na base da tela por ~2,5s (ex: carta ganha).
   type pode ser '', 'success' (verde), 'error' (vermelho) ou 'gold' (dourado). */
function toast(msg, type = '') {
  const box = $('toast-container');      // caixa onde os avisos empilham
  const el = document.createElement('div'); // cria o aviso
  el.className = 'toast ' + type; el.textContent = msg; // aplica estilo + texto
  box.appendChild(el);                   // exibe na tela
  setTimeout(() => el.classList.add('out'), 2200); // começa a sumir após 2,2s
  setTimeout(() => el.remove(), 2700);   // remove do DOM após 2,7s
  while (box.children.length > 3) box.firstChild.remove(); // máx 3 avisos por vez
}

/* ================= 6. DIFICULDADE (fórmulas por rodada) ================= */

/* cupsForRound() calcula os copos da rodada r: 3, 4, 5… até o teto de 10. */
function cupsForRound(r) { return Math.min(CONFIG.baseCups + (r - 1) * CONFIG.cupsPerRound, CONFIG.maxCups); }
/* baseBallsForRound() calcula as bolinhas da rodada r: +1 a cada 5 rodadas,
   nunca mais que (copos-1) e nunca mais que o teto. */
function baseBallsForRound(r) {
  const b = CONFIG.baseBalls + Math.floor((r - 1) / CONFIG.ballEveryNRounds);
  return Math.min(b, cupsForRound(r) - 1, CONFIG.maxBaseBalls);
}
/* speedForRound() calcula os ms de CADA movimento: começa ~600ms e cai até
   o mínimo de 165ms (embaralhamento cada vez mais rápido). */
function speedForRound(r) {
  return Math.max(640 - r * 34 - S.numCups * 8, 165);
}
/* movesForRound() calcula QUANTOS movimentos há no embaralhamento: cresce
   com a rodada e com os copos, até o teto de 30. */
function movesForRound(r) {
  return Math.min(6 + r * 2 + S.numCups, CONFIG.maxMoves);
}
/* multForRound() calcula o multiplicador de pontos: x1.0, x1.2, x1.4… */
function multForRound(r) { return 1 + (r - 1) * 0.2; }
/* showTimeForRound() calcula por quanto tempo as bolinhas ficam visíveis no
   início da rodada (diminui com a rodada, mínimo 1,1s). */
function showTimeForRound(r) { return Math.max(CONFIG.showTimeBase - r * 60, 1100); }

/* ================= 7. FLUXO DO JOGO (telas e fases) ================= */

/* showScreen() troca a tela visível: 'menu' (início), 'game' (partida) ou
   'over' (mostra a section screen-gameover). Rola para o topo. */
function showScreen(name) {
  S.screen = name; // guarda a tela atual no estado
  // Esconde todas as telas…
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  // …e mostra só a pedida ('over' usa o id screen-gameover, as outras seguem o nome).
  $('screen-' + (name === 'over' ? 'gameover' : name)).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' }); // volta ao topo com animação
}

/* setPhase() troca a FASE da rodada e atualiza o selo colorido da fase
   (roxo normal, verde na adivinhação, vermelho no game over). */
function setPhase(phase, label) {
  S.phase = phase; // guarda a fase atual (controla cliques e botões de carta)
  const el = $('phase-label'); // selo de texto da fase
  el.textContent = label; // escreve a mensagem (ex: "Embaralhando…")
  el.classList.toggle('guess', phase === 'guess'); // verde quando é hora de clicar
  el.classList.toggle('danger', phase === 'over'); // vermelho no game over
}

/* newGame() zera TUDO e começa uma run nova da rodada 1, com um deck inicial
   didático (1 Olho + 1 Seguro) para o jogador aprender as cartas. */
function newGame() {
  S.round = 1; S.score = 0; S.maxMult = 1; // rodada, pontos e mult máximo zerados
  S.totalBallsFound = 0; S.cardsObtained = 0; // estatísticas zeradas
  S.deck = { olho: 1, seguro: 1, duplicacao: 0 }; // deck inicial didático
  S.cardsUsedThisRound = new Set(); // limpa bônus de cartas
  S.shuffleToken++; // invalida qualquer embaralhamento anterior ainda rodando
  showScreen('game'); // vai para a tela do jogo
  updateHUD(); // atualiza os números do topo
  toast('🎯 Rodada 1 — memorize as bolinhas!', 'gold'); // boas-vindas
  startRound(); // inicia a rodada 1
}

/* startRound() prepara UMA rodada: calcula copos/bolinhas, sorteia quais
   copos têm bola (sempre em copos diferentes), desenha e mostra. */
function startRound() {
  S.shuffleToken++; // novo token: cancela a rodada anterior se ainda estiver animando
  const token = S.shuffleToken; // guarda o token desta rodada (verificações abaixo)
  S.numCups = cupsForRound(S.round); // nº de copos pela fórmula de dificuldade
  S.numBalls = Math.min(baseBallsForRound(S.round), S.numCups - 1); // nº de bolinhas
  S.foundCount = 0; // ninguém achou nada ainda nesta rodada
  S.cardsUsedThisRound = new Set(); // limpa o bônus de cartas da rodada

  // Sorteia as posições das bolinhas SEM repetir copo: embaralha os índices
  // [0..N-1] e pega os primeiros numBalls como os copos com bola.
  const idx = shuffleArr([...Array(S.numCups).keys()]);
  const ballSet = new Set(idx.slice(0, S.numBalls));
  // Cria os objetos dos copos: id, tem bola?, foi eliminado?, já achado?, el (div).
  S.cups = Array.from({ length: S.numCups }, (_, i) => ({ id: i, hasBall: ballSet.has(i), eliminated: false, found: false, el: null }));

  updateHUD(); // mostra rodada/bolinhas no topo
  renderCups(); // desenha os copos na arena
  runShowPhase(token); // começa pela fase de memorização
}

/* runShowPhase() é a fase MEMORIZE: levanta SÓ os copos com bolinha por
   alguns segundos, depois abaixa e chama o embaralhamento. */
async function runShowPhase(token) {
  setPhase('show', '👁️ Memorize onde estão as bolinhas!'); // selo da fase
  // Linha de info: "Rodada 1 • 3 copos • 1 bolinha".
  $('round-info').textContent = `Rodada ${S.round} • ${S.numCups} copos • ${S.numBalls} bolinha${S.numBalls > 1 ? 's' : ''}`;
  $('shuffle-progress').style.width = '0%'; // zera a barrinha de embaralhamento
  updateDeck(); // botões de carta ficam desligados fora da adivinhação
  // Revela SOMENTE os copos que têm bolinha (os demais ficam abaixados e vazios).
  requestAnimationFrame(() => S.cups.forEach(c => { if (c.hasBall) c.el.classList.add('lifted'); }));
  sfx.reveal(); // som de revelação
  await sleep(showTimeForRound(S.round)); // espera o tempo de memorização
  if (token !== S.shuffleToken) return; // rodada foi cancelada? aborta
  // Esconde: abaixa todos os copos.
  S.cups.forEach(c => c.el.classList.remove('lifted'));
  setPhase('hide', '🙈 Copos fechados… prepare-se!'); // aviso rápido
  await sleep(650); // pausa dramática de 0,65s
  if (token !== S.shuffleToken) return; // cancelada? aborta
  runShufflePhase(token); // vai para o embaralhamento
}

/* runShufflePhase() é a fase EMBARALHAR: faz N trocas animadas com velocidade
   e truques conforme a rodada (trocas simples, duplas, giros triplos, rotação). */
async function runShufflePhase(token) {
  setPhase('shuffle', '🔀 Embaralhando… acompanhe!'); // selo da fase
  lockCups(true); // trava cliques durante o embaralhamento
  const total = movesForRound(S.round); // quantos movimentos desta rodada
  const speed = speedForRound(S.round); // ms de cada movimento
  const complex = S.round >= 3;      // a partir da rodada 3: permite giros triplos
  const chaotic = S.round >= 5;      // a partir da rodada 5: permite duplos e rotação
  // Loop dos movimentos, atualizando a barrinha de progresso a cada um.
  for (let m = 0; m < total; m++) {
    if (token !== S.shuffleToken) return; // rodada cancelada? aborta
    const roll = Math.random(); // sorteia qual TRUQUE usar neste movimento
    if (chaotic && roll < 0.12 && S.numCups >= 4) {
      await rotateAll(speed);                       // TRUQUE 1: gira todos de lugar
    } else if (complex && roll < 0.32 && S.numCups >= 3) {
      // TRUQUE 2: giro triplo — sorteia 3 copos e roda as posições entre eles.
      const trio = shuffleArr([...Array(S.numCups).keys()]).slice(0, 3);
      await cycleThree(trio[0], trio[1], trio[2], speed);
    } else if (chaotic && roll < 0.42) {
      // TRUQUE 3: troca dupla — dois pares trocam em sequência rápida.
      const a = shuffleArr([...Array(S.numCups).keys()]).slice(0, 4);
      await swapCups(a[0], a[1], speed * 0.8);
      if (token !== S.shuffleToken) return;
      await swapCups(a[2], a[3], speed * 0.8);
    } else {
      // BÁSICO: troca simples de 2 copos sorteados (nunca o mesmo com ele mesmo).
      let i = rand(S.numCups), j = rand(S.numCups);
      if (i === j) j = (j + 1) % S.numCups;
      await swapCups(i, j, speed);
    }
    // Avança a barrinha de progresso do embaralhamento (0→100%).
    $('shuffle-progress').style.width = Math.round(((m + 1) / total) * 100) + '%';
  }
  if (token !== S.shuffleToken) return; // cancelada? aborta
  beginGuessPhase(); // terminou: libera os cliques para adivinhar
}

/* beginGuessPhase() é a fase ADIVINHAR: destrava os copos, atualiza os textos
   e liga os botões de carta do deck. */
function beginGuessPhase() {
  // Selo: "Encontre 2 bolinhas! Clique nos copos." (plural só se >1).
  setPhase('guess', `🎯 Encontre ${S.numBalls} bolinha${S.numBalls > 1 ? 's' : ''}! Clique nos copos.`);
  $('round-info').textContent = `Faltam ${S.numBalls - S.foundCount} • Errou = Game Over`;
  lockCups(false); // destrava os cliques
  updateHUD(); updateDeck(); // atualiza placar e botões de carta
  sfx.click(); // "plim" avisando que já pode clicar
}

/* onCupClick() roda a cada clique num copo na fase de adivinhação:
   levanta o copo; se tem bola → ponto parcial; se vazio → GAME OVER. */
async function onCupClick(i) {
  if (S.phase !== 'guess' || S.busy) return; // só vale clicar adivinhando e sem animação em curso
  const cup = S.cups[i]; // acha o copo clicado pelo índice atual
  if (!cup || cup.eliminated || cup.found) return; // ignora removido ou já achado
  if (cup.el.classList.contains('lifted')) return; // ignora se já está levantado
  S.busy = true; // trava outros cliques durante esta revelação
  cup.el.classList.add('lifted'); // levanta o copo (a bola só aparece se has-ball)
  await sleep(380); // espera a animação de levantar terminar

  if (cup.hasBall) { // ===== ACERTOU: tinha bolinha! =====
    cup.found = true; S.foundCount++; S.totalBallsFound++; // marca achada (rodada + total)
    cup.el.classList.add('correct'); // pinta de verde (classe CSS)
    sfx.correct(); // som de acerto
    // Explosão de partículas verdes no copo acertado.
    const r = cup.el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + 20, ['#34d399', '#22d3ee', '#fbbf24'], 22, 4);
    updateHUD(); // atualiza o "1/2 bolinhas" do topo
    // Achou TODAS? vence a rodada; senão, avisa quantas faltam.
    if (S.foundCount >= S.numBalls) { S.busy = false; winRound(); return; }
    $('round-info').textContent = `Faltam ${S.numBalls - S.foundCount} • Errou = Game Over`;
    toast(`🔮 Bolinha encontrada! (${S.foundCount}/${S.numBalls})`, 'success');
  } else { // ===== ERROU: copo vazio → fim da run =====
    cup.el.classList.add('wrong'); // pinta de vermelho e balança (classe CSS)
    sfx.wrong(); // som de erro
    S.busy = false; // destrava (o jogo vai para o game over mesmo assim)
    gameOver(cup, 'Você abriu um copo vazio…');
    return;
  }
  S.busy = false; // libera para o próximo clique
}

/* ================= 8. RENDER + ANIMAÇÃO FLIP ================= */

/* renderCups() desenha os copos na arena: para cada copo cria uma div com
   número, foto da bolinha, foto do copo e sombra; copos COM bola ganham a
   classe has-ball (é ela que permite a bola aparecer ao levantar). */
function renderCups() {
  const wrap = $('cups'); // contêiner flex onde os copos vivem
  wrap.innerHTML = ''; // limpa copos da rodada anterior
  $('arena-message').classList.add('hidden'); // esconde "VITÓRIA/ERROU" antigo
  // Monta um copo por vez…
  S.cups.forEach((cup, i) => {
    const d = document.createElement('div'); // cria a div do copo
    // Classe base + 'has-ball' só se este copo tem bolinha + 'locked' (travado).
    d.className = 'cup-slot locked' + (cup.hasBall ? ' has-ball' : '');
    d.setAttribute('role', 'button'); // acessibilidade: leitor de tela vê como botão
    d.setAttribute('aria-label', 'Copo ' + (i + 1)); // nome falado: "Copo 1"
    // Conteúdo: etiqueta do número, foto da bolinha, foto do copo e sombra.
    d.innerHTML = `<span class="cup-num">#${i + 1}</span>
      <div class="ball"><img src="${BALL_IMG}" alt="Bolinha" draggable="false" /></div>
      <img class="cup-body" src="${CUP_IMG}" alt="Copo" draggable="false" />
      <div class="cup-shadow"></div>`;
    // Clique: descobre o índice ATUAL do copo (muda a cada troca!) e chama onCupClick.
    d.addEventListener('click', () => onCupClick(S.cups.indexOf(cup)));
    cup.el = d; // guarda a div no objeto do copo (para animar depois)
    wrap.appendChild(d); // coloca o copo na arena
  });
}

/* lockCups() trava (lock=true) ou destrava os copos; ao destravar na fase de
   adivinhação, marca os clicáveis com a classe guessable (efeito hover). */
function lockCups(lock) {
  S.cups.forEach(c => c.el.classList.toggle('locked', lock));
  S.cups.forEach(c => c.el.classList.toggle('guessable', !lock && S.phase === 'guess' && !c.eliminated && !c.found));
}
/* refreshGuessable() reaplica o hover clicável (usada após vitória/derrota). */
function refreshGuessable() {
  const g = S.phase === 'guess'; // só há clicáveis na fase de adivinhação
  S.cups.forEach(c => c.el.classList.toggle('guessable', g && !c.eliminated && !c.found));
}

/* swapCups() anima a troca de 2 copos com a técnica FLIP (responsiva: funciona
   até com quebra de linha no celular): mede posições, reordena o DOM, anima. */
async function swapCups(i, j, speed) {
  if (i === j) return; // mesmo copo: nada a fazer
  const wrap = $('cups'); // contêiner dos copos
  // 1) FIRST: fotografa a posição de cada copo ANTES da troca.
  const before = new Map(S.cups.map(c => [c.id, c.el.getBoundingClientRect()]));
  // 2) Troca no array lógico E reordena as divs no DOM para a nova ordem.
  [S.cups[i], S.cups[j]] = [S.cups[j], S.cups[i]];
  S.cups.forEach(c => wrap.appendChild(c.el));
  // Marca os dois como "trocando" (brilho violeta) e toca o som.
  S.cups[i].el.classList.add('swapping'); S.cups[j].el.classList.add('swapping');
  sfx.swap();
  // 3) LAST+INVERT: mede a posição nova, calcula a diferença e "puxa" cada
  //    copo de volta para onde estava (sem animação, fica parado no lugar velho).
  for (const c of [S.cups[i], S.cups[j]]) {
    const oldR = before.get(c.id), now = c.el.getBoundingClientRect();
    const dx = oldR.left - now.left, dy = oldR.top - now.top;
    c.el.style.transition = 'none';
    c.el.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  void wrap.offsetWidth; // força o navegador a aplicar o estado acima (reflow)
  // 4) PLAY: anima o translate até zero = desliza para a posição nova.
  for (const c of [S.cups[i], S.cups[j]]) {
    c.el.style.transition = `transform ${Math.max(120, speed * 0.85)}ms cubic-bezier(.3,1.3,.5,1)`;
    c.el.style.transform = 'translate(0,0)';
  }
  await sleep(Math.max(130, speed * 0.9)); // espera a animação acabar
  // Limpa estilos temporários e o brilho de troca.
  for (const c of [S.cups[i], S.cups[j]]) { c.el.style.transition = ''; c.el.style.transform = ''; c.el.classList.remove('swapping'); }
  // Renumera as etiquetas (#1, #2…) conforme a nova ordem visual.
  S.cups.forEach((c, k) => { const n = c.el.querySelector('.cup-num'); if (n) n.textContent = '#' + (k + 1); });
}

/* cycleThree() faz o GIRO TRIPLO: duas trocas encadeadas que rodam 3 copos. */
async function cycleThree(i, j, k, speed) {
  await swapCups(i, j, speed * 0.7); // troca 1→2 (mais rápida que o normal)
  await swapCups(j, k, speed * 0.7); // troca 2→3 (completa o giro)
}
/* rotateAll() faz a ROTAÇÃO GERAL: o 1º copo vai para o fim da fila e todos
   deslizam uma casa, com a mesma animação FLIP das trocas. */
async function rotateAll(speed) {
  const n = S.numCups;
  if (n < 2) return; // com 0 ou 1 copo não há o que girar
  const wrap = $('cups'); // contêiner dos copos
  // Fotografa posições ANTES de mudar (ordem importa: medir primeiro!).
  const before = new Map(S.cups.map(c => [c.id, c.el.getBoundingClientRect()]));
  const first = S.cups.shift(); S.cups.push(first); // tira o 1º e joga no fim
  S.cups.forEach(c => wrap.appendChild(c.el)); // reordena as divs no DOM
  sfx.swap(); // som de movimento
  // INVERT: puxa cada copo de volta ao lugar antigo (sem animação)…
  S.cups.forEach(c => {
    const oldR = before.get(c.id);
    if (!oldR) return;
    const now = c.el.getBoundingClientRect();
    const dx = oldR.left - now.left, dy = oldR.top - now.top;
    if (Math.abs(dx) + Math.abs(dy) < 2) return; // nem se mexeu: pula
    c.el.style.transition = 'none';
    c.el.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  void wrap.offsetWidth; // reflow: aplica o estado puxado
  // PLAY: desliza todos até a posição nova…
  S.cups.forEach(c => {
    c.el.style.transition = `transform ${Math.max(140, speed)}ms ease`;
    c.el.style.transform = 'translate(0,0)';
  });
  await sleep(Math.max(150, speed)); // espera o giro terminar
  S.cups.forEach(c => { c.el.style.transition = ''; c.el.style.transform = ''; }); // limpa
  // Renumera as etiquetas conforme a nova ordem.
  S.cups.forEach((c, idx) => { const el = c.el.querySelector('.cup-num'); if (el) el.textContent = '#' + (idx + 1); });
}

/* ================= 9. CARTAS / DECK ================= */

/* updateDeck() redesenha o deck: quantidades, texto dos botões e se cada
   botão está ligado (só na adivinhação, com carta em estoque E alvo válido). */
function updateDeck() {
  // Total de cartas para o "N cartas" do cabeçalho (singular/plural).
  const total = S.deck.olho + S.deck.seguro + S.deck.duplicacao;
  $('deck-count').textContent = total + (total === 1 ? ' carta' : ' cartas');
  // Atualiza os números nas bolinhas de quantidade de cada carta.
  $('qty-olho').textContent = S.deck.olho;
  $('qty-seguro').textContent = S.deck.seguro;
  $('qty-duplicacao').textContent = S.deck.duplicacao;
  const can = S.phase === 'guess'; // cartas só funcionam adivinhando
  // Para cada botão USAR, decide se liga ou desliga…
  document.querySelectorAll('[data-use]').forEach(btn => {
    const id = btn.dataset.use; // 'olho' | 'seguro' | 'duplicacao'
    let ok = can && S.deck[id] > 0; // base: fase certa + tem carta
    // …mais a regra de cada carta (só liga se o efeito for possível):
    if (id === 'seguro' && ok) ok = S.cups.some(c => !c.hasBall && !c.eliminated && !c.found);
    if (id === 'olho' && ok) ok = S.cups.some(c => c.hasBall && !c.found && !c.el.classList.contains('lifted'));
    if (id === 'duplicacao' && ok) ok = S.cups.some(c => !c.hasBall && !c.eliminated);
    btn.disabled = !ok; // desliga o botão se não puder usar
    // Texto: "USAR (2)" com estoque, ou "VAZIO" sem carta.
    btn.textContent = S.deck[id] > 0 ? `USAR (${S.deck[id]})` : 'VAZIO';
    // Brilho neon no card quando está pronto para usar.
    btn.closest('.deck-card').classList.toggle('ready', ok);
  });
}

/* useCard() é a porta de entrada dos 3 botões USAR: valida fase/estoque e
   chama o efeito da carta pedida. */
function useCard(id) {
  if (S.phase !== 'guess') { toast('⏳ Use cartas na hora de adivinhar!', 'error'); return; }
  if (S.deck[id] <= 0) { toast('🃏 Você não tem essa carta!', 'error'); return; }
  if (id === 'olho') return useOlho(); // 🔵 revela 1 bolinha rapidinho
  if (id === 'seguro') return useSeguro(); // 🟡 remove 1 copo vazio
  if (id === 'duplicacao') return useDuplicacao(); // 🟢 cria +2 bolinhas
}

/* useOlho() — OLHO AGUÇADO 🔵: gasta 1 carta, sorteia uma bolinha ainda oculta,
   levanta o copo com brilho azul por 0,6s e abaixa de novo. Rápido de propósito! */
async function useOlho() {
  // Candidatos: copos com bola, ainda não achados e atualmente abaixados.
  const alvos = S.cups.filter(c => c.hasBall && !c.found && !c.el.classList.contains('lifted'));
  if (!alvos.length) { toast('👁️ Nenhuma bolinha oculta para revelar.', 'error'); return; }
  S.deck.olho--; S.cardsUsedThisRound.add('olho'); // consome e marca bônus de carta
  const pick = alvos[rand(alvos.length)]; // sorteia qual bolinha mostrar
  sfx.card(); updateDeck(); // som + desliga botões (gastou a carta)
  toast('🔵 Olho Aguçado: observe o brilho!', ''); // avisa para olhar rápido
  pick.el.classList.add('hint-glow'); // contorno azul pulsante (classe CSS)
  pick.el.classList.add('lifted'); // levanta o copo mostrando a bola
  // Explosãozinha azul no copo revelado para chamar atenção.
  const r = pick.el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + 30, ['#60a5fa', '#22d3ee', '#fff'], 20, 4);
  await sleep(CONFIG.olhoRevealMs); // espera 0,6s (tempo curto = desafio!)
  // Abaixa de novo (só se ainda estiver adivinhando e ninguém clicou nele).
  if (S.phase === 'guess' && !pick.found) pick.el.classList.remove('lifted');
  pick.el.classList.remove('hint-glow'); // tira o brilho azul
  updateDeck(); // religa/desliga botões conforme o novo estoque
}

/* useSeguro() — COPO SEGURO 🟡: gasta 1 carta e remove (some com) um copo
   vazio sorteado, diminuindo as opções erradas do tabuleiro. */
async function useSeguro() {
  // Candidatos: copos SEM bola, ainda na mesa e ainda não clicados.
  const vazios = S.cups.filter(c => !c.hasBall && !c.eliminated && !c.found);
  if (!vazios.length) { toast('🟡 Não há copo vazio para remover!', 'error'); return; }
  S.deck.seguro--; S.cardsUsedThisRound.add('seguro'); // consome e marca bônus
  const pick = vazios[rand(vazios.length)]; // sorteia qual vazio remover
  sfx.card(); updateDeck(); // som + atualiza deck
  toast('🟡 Copo Seguro removeu um copo vazio!', 'success'); // comemora
  // Explosão dourada no copo removido.
  const r = pick.el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + 60, ['#fbbf24', '#fde68a', '#fff'], 24, 4);
  pick.eliminated = true; // marca como fora do jogo (não clicável, não sorteável)
  pick.el.classList.add('eliminated'); // some com animação (classe CSS)
  await sleep(450); // espera o sumiço terminar
  updateDeck(); // reavalia botões (pode não haver mais vazio)
}

/* useDuplicacao() — DUPLICAÇÃO 🟢: gasta 1 carta e transforma até 2 copos
   vazios em copos COM bola (mais pontos no fim, mas precisa achar todas!). */
async function useDuplicacao() {
  // Candidatos: copos vazios ainda na mesa (eliminados não valem).
  const livres = S.cups.filter(c => !c.hasBall && !c.eliminated);
  if (!livres.length) { toast('🟢 Sem copos válidos para duplicar!', 'error'); return; }
  const k = Math.min(2, livres.length); // cria 2 (ou 1, se só houver 1 livre)
  S.deck.duplicacao--; S.cardsUsedThisRound.add('duplicacao'); // consome + bônus
  shuffleArr(livres); // embaralha para sortear quais copos ganham bola
  sfx.card(); // som de carta
  // Para cada escolhido: vira copo com bola, ganha has-ball (bola aparece) e levanta.
  for (let n = 0; n < k; n++) {
    livres[n].hasBall = true; S.numBalls++; // vira bola de verdade + conta no total
    livres[n].el.classList.add('has-ball'); // permite a bola aparecer (gate do CSS)
    livres[n].el.classList.add('lifted'); // mostra a nova bola brevemente
    // Explosão verde em cada nova bolinha.
    const r = livres[n].el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + 30, ['#34d399', '#a7f3d0', '#22d3ee'], 26, 5);
  }
  toast(`🟢 Duplicação: +${k} bolinha${k > 1 ? 's' : ''}! Ache TODAS!`, 'gold');
  confettiScreen(30); // chuvinha de confete (é carta poderosa!)
  await sleep(1100); // mostra as novas bolas por 1,1s
  // Abaixa as novas bolas para o jogador ter que lembrar onde estão.
  livres.slice(0, k).forEach(c => { if (!c.found && S.phase === 'guess') c.el.classList.remove('lifted'); });
  // Atualiza o "Faltam N" (o total a achar aumentou!) + placar + deck.
  $('round-info').textContent = `Faltam ${S.numBalls - S.foundCount} • Errou = Game Over`;
  updateHUD(); updateDeck();
}

/* ================= 10. PONTUAÇÃO ================= */

/* loadHigh() lê o recorde do localStorage (ou 0 se nunca jogou / deu erro). */
function loadHigh() {
  try { S.high = parseInt(localStorage.getItem(CONFIG.maxHighKey) || '0', 10) || 0; }
  catch { S.high = 0; } // modo anônimo bloqueando storage: joga sem recorde
}
/* saveHigh() grava o recorde no localStorage (persiste entre visitas). */
function saveHigh() {
  try { localStorage.setItem(CONFIG.maxHighKey, String(S.high)); } catch { /* privado */ }
}
/* updateHUD() redesenha os 5 números do topo: rodada, pontos, recorde,
   multiplicador e bolinhas achadas/total. */
function updateHUD() {
  $('hud-round').textContent = S.round; // rodada atual
  $('hud-score').textContent = S.score.toLocaleString('pt-BR'); // pontos com milhar pt-BR
  $('hud-high').textContent = Math.max(S.high, S.score).toLocaleString('pt-BR'); // recorde ao vivo
  $('top-high').textContent = Math.max(S.high, S.score).toLocaleString('pt-BR'); // recorde da topbar
  $('menu-high').textContent = Math.max(S.high, S.score).toLocaleString('pt-BR'); // recorde do menu
  const m = multForRound(S.round); // multiplicador desta rodada
  $('hud-mult').textContent = 'x' + m.toFixed(1); // ex: "x1.4"
  $('hud-balls').textContent = `${S.foundCount}/${S.numBalls}`; // ex: "1/2"
}

/* ================= 11. VITÓRIA / RECOMPENSA ================= */

/* winRound() roda ao achar TODAS as bolinhas: calcula pontos com o
   multiplicador, revela tudo em verde, mostra VITÓRIA e abre o modal de carta. */
function winRound() {
  const token = S.shuffleToken; // token atual (para não abrir modal de run velha)
  S.phase = 'reward'; // trava cliques: fase de recompensa
  lockCups(true); refreshGuessable(); updateDeck(); // trava copos e desliga cartas
  const mult = multForRound(S.round); // multiplicador desta vitória (x1.0, x1.2…)
  S.maxMult = Math.max(S.maxMult, mult); // guarda o maior mult (estatística final)
  const bonusCartas = S.cardsUsedThisRound.size * 30; // +30 por tipo de carta usada
  // Fórmula: base 100 + 25/rodada + 60/bolinha + bônus de cartas, tudo × mult.
  const pts = Math.round((100 + (S.round - 1) * 25 + S.numBalls * 60 + bonusCartas) * mult);
  S.score += pts; // soma ao total da run
  if (S.score > S.high) { S.high = S.score; saveHigh(); } // novo recorde? salva!
  updateHUD(); // mostra os pontos novos no topo
  sfx.win(); confettiScreen(90); // fanfarra + confetão
  // Letreiro gigante "VITÓRIA" no meio da arena.
  const msg = $('arena-message');
  msg.textContent = '✨ VITÓRIA! ✨'; msg.className = 'arena-message win';
  // Revela todas as bolinhas pintadas de verde.
  S.cups.forEach(c => { if (c.hasBall) { c.el.classList.add('lifted'); c.el.classList.add('correct'); } });
  setPhase('reward', '🏆 Você achou todas! Escolha sua recompensa…'); // selo
  // Detalha os pontos ganhos na linha de info.
  $('round-info').textContent = `+${pts.toLocaleString('pt-BR')} pontos • mult x${mult.toFixed(1)}${bonusCartas ? ' • +bônus de cartas!' : ''}`;
  // Após 1,3s de comemoração, abre o modal para escolher a carta.
  setTimeout(() => { if (token === S.shuffleToken) openReward(pts); }, 1300);
}

/* drawRewardOptions() sorteia as 3 ofertas do modal (com repetição, mas nunca
   as 3 iguais — troca a do meio se isso acontecer). */
function drawRewardOptions() {
  const opts = [CARD_IDS[rand(3)], CARD_IDS[rand(3)], CARD_IDS[rand(3)]]; // 3 sorteios
  if (new Set(opts).size === 1) opts[1] = CARD_IDS[(CARD_IDS.indexOf(opts[0]) + 1) % 3]; // evita 3 iguais
  return opts;
}
/* openReward() monta e exibe o modal: título com a rodada, pontos ganhos e
   os 3 cards clicáveis (cada clique chama pickReward uma única vez). */
function openReward(pts) {
  $('reward-round').textContent = S.round; // "RODADA 3 VENCIDA!"
  $('reward-points').textContent = `+${pts.toLocaleString('pt-BR')} pontos • mult x${multForRound(S.round).toFixed(1)}`;
  const box = $('reward-cards'); // grade onde os 3 cards entram
  box.innerHTML = ''; // limpa ofertas da vitória anterior
  // Cria um card por oferta sorteada…
  drawRewardOptions().forEach(id => {
    const c = CARDS[id]; // dados da carta (nome, ícone, cor, descrição)
    const d = document.createElement('div'); // div do card
    d.className = 'reward-card ' + c.cor; // cor da borda (blue/yellow/green)
    d.innerHTML = `<span class="rc-icon">${c.icone}</span><b>${c.nome}</b><small>${c.desc}</small><span class="rc-pick">ADICIONAR AO DECK</span>`;
    d.addEventListener('click', () => pickReward(id), { once: true }); // 1 clique = escolheu
    box.appendChild(d);
  });
  $('reward-modal').classList.remove('hidden'); // mostra o modal
}
/* pickReward() aplica a escolha: soma a carta ao deck, fecha o modal, avança
   a rodada e já começa a próxima. */
function pickReward(id) {
  S.deck[id]++; S.cardsObtained++; // +1 no deck e na estatística
  sfx.card(); // som de carta
  toast(`${CARDS[id].icone} ${CARDS[id].nome} adicionada ao deck!`, 'success'); // confirma
  $('reward-modal').classList.add('hidden'); // fecha o modal
  S.round++; // próxima rodada (mais copos, mais velocidade!)
  startRound(); // começa a nova rodada
}

/* ================= GAME OVER ================= */

/* gameOver() roda ao clicar num copo vazio (ou desistir com pontos): revela as
   bolinhas, marca o erro, atualiza o recorde e mostra a tela final após 1,4s. */
function gameOver(cup, reason) {
  S.shuffleToken++; // cancela qualquer animação/embaralhamento pendente
  S.phase = 'over'; // fase final: nada mais é clicável
  lockCups(true); refreshGuessable(); updateDeck(); // trava tudo e desliga cartas
  setPhase('over', '💀 Game Over!'); // selo vermelho
  // Revela onde estavam TODAS as bolinhas (para o jogador conferir).
  S.cups.forEach(c => { if (c.hasBall) c.el.classList.add('lifted'); });
  if (cup) cup.el.classList.add('wrong'); // marca o copo do erro de vermelho
  // Explosão vermelha no copo do erro (se houver copo — desistência não tem).
  const r = cup ? cup.el.getBoundingClientRect() : null;
  if (r) burst(r.left + r.width / 2, r.top + 60, ['#f87171', '#ef4444', '#fff'], 30, 5);
  // Letreiro gigante "ERROU" na arena.
  const msg = $('arena-message');
  msg.textContent = '💀 ERROU!'; msg.className = 'arena-message lose';
  // Recorde: se empatou ou passou (com pontos), conta como recorde.
  const isRecord = S.score > 0 && S.score >= S.high;
  if (S.score > S.high) { S.high = S.score; saveHigh(); } // salva se passou
  // Após 1,4s (tempo de ver o erro), toca fanfarra se for recorde e abre a tela final.
  setTimeout(() => {
    if (isRecord && S.score > 0) sfx.newRecord();
    showGameOver(reason, isRecord);
  }, 1400);
}

/* showGameOver() preenche a tela final: motivo, rodada, pontos, recorde,
   bolinhas, mult máximo, cartas ganhas e o deck restante. */
function showGameOver(reason, isRecord) {
  showScreen('over'); // troca para a tela de game over
  // Frase do motivo + contexto ("Era a rodada 4 com 6 copos e 1 bolinha.").
  $('go-reason').textContent = reason + ` Era a rodada ${S.round} com ${S.numCups} copos e ${S.numBalls} bolinha${S.numBalls > 1 ? 's' : ''}.`;
  $('go-emoji').textContent = ['💀', '😵', '🤯', '👻'][rand(4)]; // caveirinha aleatória
  $('go-round').textContent = S.round; // rodada alcançada
  $('go-score').textContent = S.score.toLocaleString('pt-BR'); // pontuação final
  $('go-high').textContent = S.high.toLocaleString('pt-BR'); // recorde
  $('go-balls').textContent = S.totalBallsFound; // bolinhas achadas na run
  $('go-mult').textContent = 'x' + S.maxMult.toFixed(1); // maior mult da run
  const nCards = S.cardsObtained; // cartas ganhas na run
  $('go-cards').textContent = nCards;
  // Selo "NOVO RECORDE" só aparece se for recorde com pontos.
  $('go-record').classList.toggle('hidden', !(isRecord && S.score > 0));
  // Resumo do deck restante (ou aviso de deck vazio).
  const gd = $('go-deck');
  gd.innerHTML = S.deck.olho + S.deck.seguro + S.deck.duplicacao > 0
    ? `<span class="go-pill">🔵 Olho x${S.deck.olho}</span><span class="go-pill">🟡 Seguro x${S.deck.seguro}</span><span class="go-pill">🟢 Duplicação x${S.deck.duplicacao}</span>`
    : '<span>Deck vazio — colecione cartas vencendo rodadas!</span>';
}

/* ================= 12. BINDINGS + BOOT ================= */

/* bindUI() liga TODOS os botões do jogo às suas ações (menu, mudo, deck,
   desistir, recomeçar) e registra o redimensionamento do canvas. */
function bindUI() {
  // Botão "JOGAR AGORA" do menu → começa run nova.
  $('btn-start').addEventListener('click', () => { sfx.click(); newGame(); });
  // Botão "JOGAR DE NOVO" do game over → começa run nova.
  $('btn-again').addEventListener('click', () => { sfx.click(); newGame(); });
  // Botão "MENU" do game over → cancela animações e volta ao menu.
  $('btn-menu').addEventListener('click', () => { sfx.click(); S.shuffleToken++; showScreen('menu'); updateHUD(); });
  // Botão "Recomeçar" na partida → começa run nova do zero.
  $('btn-restart').addEventListener('click', () => { sfx.click(); newGame(); });
  // Botão "Desistir": com pontos, conta como derrota; sem pontos, só volta ao menu.
  $('btn-quit').addEventListener('click', () => {
    sfx.click();
    if (S.score > 0) gameOver(null, 'Você desistiu da run.');
    else { S.shuffleToken++; showScreen('menu'); }
  });
  // Botão "COMO JOGAR" → mostra/esconde o tutorial.
  $('btn-how').addEventListener('click', () => { sfx.click(); $('howto').classList.toggle('hidden'); });
  // Botão de som → alterna mudo e troca o ícone 🔊/🔇.
  $('btn-mute').addEventListener('click', () => {
    S.muted = !S.muted;
    $('btn-mute').textContent = S.muted ? '🔇' : '🔊';
    if (!S.muted) sfx.click(); // confirma que o som voltou
  });
  // Os 3 botões USAR do deck → cada um chama useCard com sua carta.
  document.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => useCard(b.dataset.use)));
  $('year').textContent = new Date().getFullYear(); // ano atual no rodapé
  addEventListener('resize', sizeCanvas); // janela mudou? reajusta o canvas
}

/* ---- BOOT: sequência de inicialização ao abrir a página ---- */
loadHigh(); // 1) carrega o recorde salvo no navegador
sizeCanvas(); // 2) ajusta o canvas de partículas ao tamanho da tela
loopParticles(); // 3) inicia o loop infinito das partículas de fundo
bindUI(); // 4) liga todos os botões
updateHUD(); // 5) escreve os números iniciais (0, recorde etc.)
showScreen('menu'); // 6) mostra a tela do menu (ponto de partida)
