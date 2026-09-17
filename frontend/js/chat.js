// chat.js
// =======
// Comportamento das telas de conversa: tela de boas-vindas
// (dashboard.html) e tela de conversa em si (chat.html).
//
// Equivalente a public/js/chat.js do original, com um acréscimo: como
// chat.html agora é um arquivo estático (não recebe mais `messages` já
// prontas do servidor via EJS), este arquivo também busca as mensagens
// da conversa atual via GET /api/chats/<id> e as desenha na tela.

// Personalidade escolhida na tela de boas-vindas antes de a conversa
// existir (ainda não há chat.personality pra ler) - default casa com
// personalities.DEFAULT_PERSONALITY no backend, e é atualizada assim
// que o picker é montado (ver setupWelcomePersonalityPicker).
var selectedWelcomePersonality = "trashtalker";
var selectedWelcomeEffort = "trash";

// Preenchido por setupChatPersonalityPicker(). Guardado no módulo porque
// o envio de mensagem precisa mexer no seletor de fora dele: quando o
// MathIAs entrega os pontos num textão, a personalidade da conversa muda
// no backend sem ninguém ter tocado no pill (ver refletirPersonalidade).
var chatPicker = null;

// Envio em andamento (um por tela). Enquanto isso não for null, a IA está
// "pensando": o campo fica bloqueado e a seta de enviar vira o botão de
// parar. Guarda o que é preciso pra desfazer a rodada se a pessoa parar.
var envioEmAndamento = null;
var envioBoasVindas = null;

// Quadrado de "parar", no lugar da seta de enviar enquanto a IA responde.
var ICONE_PARAR =
  '<svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor"><rect x="5.6" y="5.6" width="8.8" height="8.8" rx="1.6"></rect></svg>';

document.addEventListener("DOMContentLoaded", function () {
  wireComposer("welcome-form", "welcome-input", "welcome-submit", function (e) {
    // Tela de boas-vindas: cria a conversa e já manda a primeira
    // mensagem (Stage 3), em vez de descartar o texto digitado.
    e.preventDefault();
    // Com um envio em andamento, o mesmo botão é o "parar".
    if (envioBoasVindas) {
      pararBoasVindas();
      return;
    }

    var input = document.getElementById("welcome-input");
    var text = input.value.trim();
    if (!text) return;

    var controller = new AbortController();
    envioBoasVindas = { controller: controller, texto: text, chatId: null };
    setComposerPensando("welcome-input", "welcome-submit", true);

    apiFetch("/api/chats", {
      method: "POST",
      body: {
        personality: selectedWelcomePersonality,
        effort: selectedWelcomeEffort,
      },
    })
      .then(function (result) {
        // Parou entre criar a conversa e mandar a mensagem: a conversa
        // recém-criada não serve mais pra nada, some com ela.
        if (!envioBoasVindas) {
          descartarConversa(result.id);
          return;
        }
        envioBoasVindas.chatId = result.id;

        return apiFetch("/api/chats/" + result.id + "/messages", {
          method: "POST",
          body: { content: text },
          signal: controller.signal,
        })
          .catch(function (err) {
            // A conversa já foi criada e a mensagem do usuário já foi
            // salva antes de chamar a IA (ver chats_api.py) - se só a
            // IA falhar, ainda vale levar o usuário até a conversa em
            // vez de travar na tela de boas-vindas. Parada deliberada é
            // outra história: quem trata é pararBoasVindas().
            if (err && err.name === "AbortError") throw err;
          })
          .then(function () {
            if (!envioBoasVindas) return;
            window.location.href = "/dashboard/chat/" + result.id;
          });
      })
      .catch(function (err) {
        // Já desfeito por pararBoasVindas() - nada a relatar.
        if (!envioBoasVindas) return;
        envioBoasVindas = null;
        setComposerPensando("welcome-input", "welcome-submit", false);
        alert(err.message);
      });
  });

  wireComposer("chat-form", "chat-input", "chat-submit", function (e) {
    // Tela de conversa: desenha a mensagem do usuário na hora (otimista),
    // manda pro backend salvar e chamar a IA, e desenha a resposta
    // assim que ela chega (Stage 3).
    e.preventDefault();
    // Com um envio em andamento, o mesmo botão é o "parar". Precisa vir
    // antes da checagem de texto vazio abaixo: enquanto a IA responde o
    // campo está vazio e bloqueado, então sem isto o clique não faria nada.
    if (envioEmAndamento) {
      pararDeResponder();
      return;
    }

    var input = document.getElementById("chat-input");
    var text = input.value.trim();
    if (!text) return;

    var messages = document.getElementById("chat-messages");
    var empty = messages.querySelector(".chat-empty");
    if (empty) empty.remove();

    var userBubble = buildMessageBubble("user", text);
    messages.appendChild(userBubble);

    input.value = "";

    var typingBubble = buildTypingBubble();
    messages.appendChild(typingBubble);
    messages.scrollTop = messages.scrollHeight;

    var chatId = window.location.pathname.split("/").pop();
    var controller = new AbortController();
    envioEmAndamento = {
      controller: controller,
      chatId: chatId,
      texto: text,
      userBubble: userBubble,
      typingBubble: typingBubble,
    };
    setComposerPensando("chat-input", "chat-submit", true);

    apiFetch("/api/chats/" + chatId + "/messages", {
      method: "POST",
      body: { content: text },
      signal: controller.signal,
    })
      .then(function (result) {
        if (!envioEmAndamento) return; // parada deliberada, já desfeita
        envioEmAndamento = null;
        setComposerPensando("chat-input", "chat-submit", false);
        typingBubble.remove();

        // Preguiça do MathIAs: ele largou o osso e a conversa passou pro
        // TrashTalker. A fala dele entra inteira (não vale efeito de
        // digitação duas vezes seguidas) e o pill acompanha a troca que o
        // backend já gravou.
        if (result.handoffMessage) {
          messages.appendChild(
            buildMessageBubble("assistant", result.handoffMessage.content),
          );
          if (result.chat) refletirPersonalidade(result.chat.personality);
        }

        var assistantBubble = buildMessageBubble("assistant", "");
        messages.appendChild(assistantBubble);
        revealGradually(
          assistantBubble.querySelector(".msg-content"),
          result.assistantMessage.content,
          messages,
        );

        // Se essa foi a primeira mensagem, o backend já gerou um
        // título automático pra conversa - reflete na sidebar sem
        // precisar recarregar a página.
        if (result.chat) {
          var link = document.querySelector(
            '.chat-link[href="/dashboard/chat/' + chatId + '"]',
          );
          if (link) {
            var label = link.querySelector(".chat-link-text");
            if (label) label.textContent = result.chat.title;
            link.title = result.chat.title;
            link.setAttribute("aria-label", result.chat.title);
          }
        }
      })
      .catch(function (err) {
        if (!envioEmAndamento) return; // parada deliberada, já desfeita
        envioEmAndamento = null;
        setComposerPensando("chat-input", "chat-submit", false);
        typingBubble.remove();
        alert(err.message);
      });
  });

  loadChatMessagesIfNeeded();
  setupWelcomePersonalityPicker();

  // Modo de voz (beta) - ver js/voice.js. Não faz nada se o navegador
  // não suportar reconhecimento de fala. Só uma das duas telas existe por
  // página (conversa ou boas-vindas), então o || escolhe a que estiver lá.
  if (typeof initVoiceInput === "function") {
    initVoiceInput(
      document.getElementById("chat-input") ||
        document.getElementById("welcome-input"),
    );
  }
});

function wireComposer(formId, inputId, submitId, onSubmit) {
  var form = document.getElementById(formId);
  var input = document.getElementById(inputId);
  var submit = document.getElementById(submitId);
  if (!form || !input || !submit) return;

  function sync() {
    submit.disabled = !input.value.trim();
    resizeComposerInput(input);
  }
  input.addEventListener("input", sync);
  sync();

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  if (onSubmit) form.addEventListener("submit", onSubmit);
}

function resizeComposerInput(input) {
  input.style.height = "auto";
  input.style.height = Math.min(180, input.scrollHeight) + "px";
}

// Equivalente ao partial src/views/partials/message-bubble.ejs.
function buildMessageBubble(role, content) {
  var bubble = document.createElement("div");
  bubble.className = "msg-bubble " + (role === "user" ? "msg-user" : "msg-assistant");
  var userIcon =
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6.8" r="3.2"></circle><path d="M3.6 17c0-3.6 2.9-6 6.4-6s6.4 2.4 6.4 6"></path></svg>';
  var botIcon =
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7.3" width="13" height="9.2" rx="2.4"></rect><line x1="10" y1="7.3" x2="10" y2="4.3"></line><circle cx="10" cy="3.2" r="1" fill="currentColor" stroke="none"></circle><circle cx="7.3" cy="11.7" r="1" fill="currentColor" stroke="none"></circle><circle cx="12.7" cy="11.7" r="1" fill="currentColor" stroke="none"></circle></svg>';
  bubble.innerHTML = '<div class="msg-avatar">' + (role === "user" ? userIcon : botIcon) + '</div><div class="msg-content"></div>';
  bubble.querySelector(".msg-content").textContent = content;

  // Modo de voz (beta): botão de ouvir só nas respostas da IA. O typeof
  // é porque chat.js também roda no dashboard.html, que não carrega
  // js/voice.js - e porque o módulo inteiro pode ser removido.
  if (role !== "user" && typeof addSpeakButton === "function") {
    addSpeakButton(bubble);
  }
  return bubble;
}

// Bolha "digitando..." (3 pontinhos pulsando), mostrada no lugar da
// resposta enquanto a IA ainda não respondeu.
function buildTypingBubble() {
  var bubble = buildMessageBubble("assistant", "");
  bubble.classList.add("msg-typing");
  bubble.setAttribute("aria-label", "A IA está pensando...");
  // Não há texto para ler enquanto os pontinhos pulsam.
  var botaoVoz = bubble.querySelector(".voice-speak-button");
  if (botaoVoz) botaoVoz.remove();
  bubble.querySelector(".msg-content").innerHTML =
    '<span aria-hidden="true" class="typing-dot"></span><span aria-hidden="true" class="typing-dot"></span><span aria-hidden="true" class="typing-dot"></span>';
  return bubble;
}

// Revela o texto aos poucos (efeito máquina de escrever) em vez de tudo
// de uma vez - só para respostas novas chegando ao vivo (mensagens
// carregadas do histórico continuam aparecendo na hora, ver
// loadChatMessagesIfNeeded). A quantidade de caracteres por "tick" cresce
// com o tamanho do texto para que a animação sempre dure ~1.8s, tanto
// pra uma resposta curta quanto pra uma longa.
function revealGradually(contentEl, text, scrollContainer) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    contentEl.textContent = text;
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    return;
  }
  // Announce the completed response, not each animated text fragment.
  if (scrollContainer) scrollContainer.setAttribute("aria-busy", "true");
  var TICK_MS = 20;
  var TARGET_TICKS = 90;
  var charsPerTick = Math.max(1, Math.ceil(text.length / TARGET_TICKS));
  var shown = 0;

  var timer = setInterval(function () {
    var atBottom = scrollContainer && scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100;
    shown = Math.min(text.length, shown + charsPerTick);
    contentEl.textContent = text.slice(0, shown);
    if (atBottom) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    if (shown >= text.length) {
      clearInterval(timer);
      if (scrollContainer) scrollContainer.removeAttribute("aria-busy");
    }
  }, TICK_MS);
}

async function loadChatMessagesIfNeeded() {
  var container = document.getElementById("chat-messages");
  if (!container) return;

  // O id da conversa vem da própria URL: /dashboard/chat/<id>, igual à
  // rota original em src/routes/pages.ts.
  var chatId = window.location.pathname.split("/").pop();

  var data;
  try {
    data = await apiFetch("/api/chats/" + chatId);
  } catch (_err) {
    // Conversa inexistente ou de outro usuário: volta para o dashboard,
    // igual ao redirect original quando getOwnedChat() não encontra nada.
    window.location.href = "/dashboard";
    return;
  }

  container.innerHTML = "";
  setupChatPersonalityPicker(chatId, {
    personality: data.chat.personality,
    effort: data.chat.effort,
  });

  if (data.messages.length === 0) {
    var empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "Sem mensagens ainda. Comece a jogar conversa fora!";
    container.appendChild(empty);
    return;
  }

  data.messages.forEach(function (message) {
    container.appendChild(buildMessageBubble(message.role, message.content));
  });
  container.scrollTop = container.scrollHeight;
}

// Enquanto a IA responde, o campo de texto fica bloqueado (nada de mandar
// uma mensagem por cima da outra) e a seta de enviar vira um quadrado de
// "parar". É o mesmo botão nos dois estados de propósito: sempre no mesmo
// lugar, sem nada mudando de posição no meio da conversa.
//
// O ícone original da seta vem do HTML e é guardado no próprio elemento na
// primeira troca, em vez de duplicado aqui - assim mexer no SVG do
// chat.html/dashboard.html continua bastando.
function setComposerPensando(inputId, submitId, pensando) {
  var input = document.getElementById(inputId);
  var submit = document.getElementById(submitId);
  if (!input || !submit) return;

  if (!submit.dataset.iconeEnviar) submit.dataset.iconeEnviar = submit.innerHTML;
  if (!input.dataset.placeholderOriginal) {
    input.dataset.placeholderOriginal = input.placeholder;
  }

  input.disabled = pensando;
  resizeComposerInput(input);
  input.placeholder = pensando
    ? "A IA está pensando..."
    : input.dataset.placeholderOriginal;

  submit.innerHTML = pensando ? ICONE_PARAR : submit.dataset.iconeEnviar;
  submit.classList.toggle("is-stop", pensando);
  submit.title = pensando ? "Parar de responder" : "Enviar mensagem";
  submit.setAttribute(
    "aria-label",
    pensando ? "Parar de responder" : "Enviar mensagem",
  );
  // Parando, o botão fica sempre clicável; voltando ao normal, vale a
  // mesma regra do wireComposer (só habilita se há texto).
  submit.disabled = pensando ? false : !input.value.trim();

  // O microfone do modo de voz (beta) ditaria para um campo bloqueado.
  var mic = document.querySelector(".voice-mic-button");
  if (mic) mic.disabled = pensando;

  if (!pensando) input.focus();
}

// Botão de parar na tela de conversa. Desfaz a rodada inteira: tira as
// bolhas, devolve o texto pro campo e manda o backend apagar a mensagem
// que estava sendo respondida (ver cancel_message em chats_api.py) - a
// conversa fica exatamente como estava antes do envio.
function pararDeResponder() {
  var pedido = envioEmAndamento;
  if (!pedido) return;
  // Zerado ANTES do abort: o .catch do envio usa isso pra saber que a
  // parada foi deliberada e não deve mostrar erro nenhum.
  envioEmAndamento = null;

  pedido.controller.abort();
  pedido.userBubble.remove();
  pedido.typingBubble.remove();

  var input = document.getElementById("chat-input");
  if (input) input.value = pedido.texto;
  setComposerPensando("chat-input", "chat-submit", false);

  // Silencioso de propósito: a rodada já foi desfeita na tela, e um alerta
  // de erro numa limpeza que a pessoa nem sabe que existe só confundiria.
  apiFetch("/api/chats/" + pedido.chatId + "/cancel", {
    method: "POST",
  }).catch(function () {});
}

// Botão de parar na tela de boas-vindas. Aqui a conversa tinha acabado de
// ser criada só para essa mensagem, então some com ela inteira em vez de
// deixar uma conversa vazia na barra lateral (o DELETE em cascata do
// schema leva as mensagens junto).
function pararBoasVindas() {
  var pedido = envioBoasVindas;
  if (!pedido) return;
  envioBoasVindas = null;

  pedido.controller.abort();

  var input = document.getElementById("welcome-input");
  if (input) input.value = pedido.texto;
  setComposerPensando("welcome-input", "welcome-submit", false);

  if (pedido.chatId) descartarConversa(pedido.chatId);
}

function descartarConversa(chatId) {
  apiFetch("/api/chats/" + chatId + "/delete", { method: "POST" }).catch(
    function () {},
  );
}

// Tela de boas-vindas: ainda não existe conversa, então não há
// chat.personality pra ler - a seleção só existe localmente até o
// welcome-form ser enviado.
function setupWelcomePersonalityPicker() {
  var container = document.getElementById("personality-picker");
  if (!container || !document.getElementById("welcome-form")) return;

  apiFetch("/api/dashboard")
    .then(function (data) {
      var picker = initPersonalityPicker(
        container,
        [
          {
            key: "personality",
            options: data.personalities,
            selected: selectedWelcomePersonality,
          },
          {
            key: "effort",
            label: "Esforço",
            options: data.efforts,
            selected: selectedWelcomeEffort,
          },
        ],
        function (grupo, id) {
          if (grupo === "personality") selectedWelcomePersonality = id;
          else selectedWelcomeEffort = id;
          picker.setSelected(grupo, id);
        },
      );
    })
    .catch(function () {
      // Sem o picker, a conversa ainda é criada normalmente com a
      // personalidade e o esforço padrão.
    });
}

// Tela de conversa: personalidade e esforço atuais já vêm em
// GET /api/chats/<id> (loadChatMessagesIfNeeded) - só a lista de opções
// (nome/subtítulo de cada uma) precisa de uma chamada própria a
// GET /api/dashboard.
function setupChatPersonalityPicker(chatId, atual) {
  var container = document.getElementById("personality-picker");
  if (!container) return;

  // Rota e nome do campo que cada grupo salva no backend.
  var rotas = {
    personality: { path: "/personality", campo: "personality" },
    effort: { path: "/effort", campo: "effort" },
  };

  apiFetch("/api/dashboard")
    .then(function (data) {
      var picker = initPersonalityPicker(
        container,
        [
          {
            key: "personality",
            options: data.personalities,
            selected: atual.personality,
          },
          {
            key: "effort",
            label: "Esforço",
            options: data.efforts,
            selected: atual.effort,
          },
        ],
        function (grupo, id) {
          var anterior = atual[grupo];
          // Reflete a escolha na hora e desfaz se o backend recusar.
          picker.setSelected(grupo, id);
          atual[grupo] = id;

          var rota = rotas[grupo];
          var body = {};
          body[rota.campo] = id;

          apiFetch("/api/chats/" + chatId + rota.path, {
            method: "POST",
            body: body,
          }).catch(function (err) {
            picker.setSelected(grupo, anterior);
            atual[grupo] = anterior;
            alert(err.message);
          });
        },
      );
      chatPicker = { picker: picker, atual: atual };
    })
    .catch(function () {
      // Sem a lista, a conversa continua com o que já está salvo - só
      // não dá pra trocar nesta carga de página.
    });
}

// Sincroniza o pill com a personalidade que já está salva no banco, para
// os casos em que ela muda sem o usuário abrir o seletor - hoje só a
// preguiça do MathIAs (ver routes/chats_api.py:send_message). Silencioso
// se o picker ainda não montou ou se nada mudou.
function refletirPersonalidade(personality) {
  if (!chatPicker || !personality) return;
  if (chatPicker.atual.personality === personality) return;
  chatPicker.atual.personality = personality;
  chatPicker.picker.setSelected("personality", personality);
}
