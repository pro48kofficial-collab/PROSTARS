const socket = io();

const $ =
  selector =>
    document.querySelector(
      selector
    );

const $$ =
  selector =>
    [...document.querySelectorAll(
      selector
    )];

let playerId =
  localStorage.getItem(
    "prostars_player_id"
  );

if (!playerId) {

  playerId =
    crypto.randomUUID();

  localStorage.setItem(
    "prostars_player_id",
    playerId
  );
}

let config = null;
let player = null;
let selectedCase = null;

let avatarData = "";

const headers = {
  "Content-Type":
    "application/json",

  "x-player-id":
    playerId
};

/* =========================
   API
========================= */

async function api(
  url,
  options = {}
) {

  const response =
    await fetch(
      url,
      {
        ...options,

        headers: {
          ...headers,
          ...(options.headers || {})
        }
      }
    );

  const data =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (!response.ok) {

    const error =
      new Error(
        data.error ||
        "Помилка"
      );

    Object.assign(
      error,
      data
    );

    throw error;
  }

  return data;
}

/* =========================
   DEFAULT AVATAR
========================= */

function avatarPlaceholder() {

  return (
    "data:image/svg+xml," +
    encodeURIComponent(`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="200"
        height="200"
      >

        <rect
          width="100%"
          height="100%"
          fill="#24242d"
        />

        <text
          x="50%"
          y="60%"
          text-anchor="middle"
          font-size="80"
        >
          👤
        </text>

      </svg>
    `)
  );
}

/* =========================
   START
========================= */

async function start() {

  try {

    config =
      await fetch(
        "/api/config"
      )
      .then(
        response =>
          response.json()
      );

    player =
      await api(
        "/api/player",
        {
          method: "POST",
          body: "{}"
        }
      );

    render();

    loadInventory();

    loadTop();

  } catch (error) {

    console.error(error);

    alert(
      "Не вдалося підключитися до сервера"
    );
  }
}

/* =========================
   RENDER
========================= */

function render() {

  $("#balance")
    .textContent =
      `${player.stars} ⭐`;

  $("#earned")
    .textContent =
      player.earned;

  $("#spent")
    .textContent =
      player.spent;

  $("#nickname")
    .value =
      player.nickname || "";

  $("#profileAvatar")
    .src =
      player.avatar ||
      avatarPlaceholder();

  renderCases();
}

/* =========================
   CASES
========================= */

function renderCases() {

  const cases =
    Object.values(
      config.cases
    );

  $("#casesGrid")
    .innerHTML =
      cases
        .map(
          c => {

            let description =
              "";

            if (
              c.id === "free"
            ) {

              description =
                "1 раз на 24 години + підписка";

            } else {

              description =
                `Ціна: ${c.price} ⭐`;
            }

            return `
              <article
                class="caseCard"
              >

                <div
                  class="caseImage"
                >

                  <img
                    src="${c.image}"
                    alt="${c.name}"
                    onerror="
                      this.style.display='none';
                    "
                  >

                </div>

                <h3>
                  ${c.name}
                </h3>

                <p>
                  ${description}
                </p>

                <button
                  class="mainButton"
                  onclick="
                    openCase('${c.id}')
                  "
                >
                  Відкрити
                </button>

              </article>
            `;
          }
        )
        .join("");
}

/* =========================
   CASE REEL
========================= */

function makeReel(
  caseId
) {

  const prizes =
    config.prizes[
      caseId
    ];

  let html = "";

  for (
    let i = 0;
    i < 40;
    i++
  ) {

    const prize =
      prizes[
        i % prizes.length
      ];

    html += `
      <div
        class="reelCard"
      >

        <img
          src="${prize.image}"
          alt="${prize.stars}"
          onerror="
            this.style.display='none';
          "
        >

      </div>
    `;
  }

  return html;
}

/* =========================
   OPEN CASE MODAL
========================= */

function openCase(
  caseId
) {

  selectedCase =
    caseId;

  $("#caseModal")
    .classList
    .remove("hidden");

  $("#modalTitle")
    .textContent =
      config.cases[
        caseId
      ].name;

  $("#reel")
    .innerHTML =
      makeReel(caseId);

  $("#telegramBox")
    .classList
    .toggle(
      "hidden",
      caseId !== "free"
    );

  $("#result")
    .textContent =
      "";

  $("#openCaseButton")
    .disabled =
      false;

  $("#openCaseButton")
    .textContent =
      "Відкрити";

  $("#reel")
    .scrollLeft =
      0;
}

window.openCase =
  openCase;

/* =========================
   CLOSE MODAL
========================= */

$("#closeModal")
  .onclick =
    () => {

      $("#caseModal")
        .classList
        .add("hidden");
    };

/* =========================
   OPEN
========================= */

$("#openCaseButton")
  .onclick =
    openSelectedCase;

async function openSelectedCase() {

  const button =
    $("#openCaseButton");

  button.disabled =
    true;

  button.textContent =
    "Відкриваємо...";

  try {

    const result =
      await api(
        "/api/open",
        {
          method: "POST",

          body:
            JSON.stringify({
              caseId:
                selectedCase,

              telegramId:
                $("#telegramId")
                  .value
                  .trim()
            })
        }
      );

    animatePrize(
      result.prize
    );

  } catch (error) {

    alert(
      error.message
    );

    button.disabled =
      false;

    button.textContent =
      "Відкрити";
  }
}

/* =========================
   ANIMATION
========================= */

function animatePrize(
  prize
) {

  const reel =
    $("#reel");

  let html = "";

  const prizes =
    config.prizes[
      selectedCase
    ];

  for (
    let i = 0;
    i < 42;
    i++
  ) {

    const item =
      prizes[
        i % prizes.length
      ];

    html += `
      <div
        class="reelCard"
      >

        <img
          src="${item.image}"
          alt="${item.stars}"
        >

      </div>
    `;
  }

  html += `
    <div
      class="reelCard"
      data-winner="true"
    >

      <img
        src="${prize.image}"
        alt="${prize.stars}"
      >

    </div>
  `;

  reel.innerHTML =
    html;

  const winner =
    reel.querySelector(
      "[data-winner='true']"
    );

  setTimeout(
    () => {

      reel.scrollTo({
        left:
          winner.offsetLeft -
          reel.clientWidth / 2 +
          winner.clientWidth / 2,

        behavior:
          "smooth"
      });

    },
    100
  );

  setTimeout(
    async () => {

      $("#result")
        .textContent =
          `🎉 Тобі випало ${prize.stars} ⭐`;

      await refreshPlayer();

      await loadInventory();

      await loadTop();

      setTimeout(
        () => {

          $("#caseModal")
            .classList
            .add("hidden");

          $("#openCaseButton")
            .disabled =
              false;

          $("#openCaseButton")
            .textContent =
              "Відкрити";

        },
        1400
      );

    },
    2700
  );
}

/* =========================
   REFRESH PLAYER
========================= */

async function refreshPlayer() {

  player =
    await api(
      "/api/player",
      {
        method: "POST",
        body: "{}"
      }
    );

  render();
}

/* =========================
   INVENTORY
========================= */

async function loadInventory() {

  try {

    const items =
      await api(
        "/api/inventory"
      );

    if (!items.length) {

      $("#inventoryGrid")
        .innerHTML =
          `
            <p>
              🎒 Інвентар порожній.
            </p>
          `;

      return;
    }

    $("#inventoryGrid")
      .innerHTML =
        items
          .map(
            item => {

              return `
                <div
                  class="item"
                >

                  <div
                    class="itemImage"
                  >

                    <img
                      src="${item.image}"
                      alt="${item.stars}"
                      onerror="
                        this.style.display='none';
                      "
                    >

                  </div>

                  <b>
                    ${item.stars} ⭐
                  </b>

                  <small>
                    ${escapeHtml(
                      item.case_id
                    )}
                  </small>

                  <button
                    class="sellButton"
                    onclick="
                      sellItem(${item.id})
                    "
                  >
                    Забрати
                    ${item.stars}
                    ⭐
                  </button>

                </div>
              `;
            }
          )
          .join("");

  } catch (error) {

    console.error(error);
  }
}

/* =========================
   SELL
========================= */

async function sellItem(
  itemId
) {

  try {

    const result =
      await api(
        `/api/inventory/${itemId}/sell`,
        {
          method: "POST",
          body: "{}"
        }
      );

    alert(
      `+${result.stars} ⭐`
    );

    await refreshPlayer();

    await loadInventory();

    await loadTop();

  } catch (error) {

    alert(
      error.message
    );
  }
}

window.sellItem =
  sellItem;

/* =========================
   TOP
========================= */

async function loadTop() {

  try {

    const players =
      await fetch(
        "/api/top"
      )
      .then(
        response =>
          response.json()
      );

    $("#topList")
      .innerHTML =
        players
          .map(
            (p, index) => {

              return `
                <div
                  class="rank"
                >

                  <b>
                    #${index + 1}
                  </b>

                  <img
                    src="${
                      p.avatar ||
                      avatarPlaceholder()
                    }"
                    alt=""
                  >

                  <span>
                    ${escapeHtml(
                      p.nickname
                    )}
                  </span>

                  <span
                    class="rankStars"
                  >
                    ${p.earned}
                    ⭐
                  </span>

                </div>
              `;
            }
          )
          .join("");

  } catch (error) {

    console.error(error);
  }
}

/* =========================
   PROFILE AVATAR
========================= */

$("#avatarInput")
  .addEventListener(
    "change",
    event => {

      const file =
        event.target.files[0];

      if (!file) {
        return;
      }

      if (
        file.size >
        2 * 1024 * 1024
      ) {

        alert(
          "Аватар має бути до 2 МБ"
        );

        event.target.value =
          "";

        return;
      }

      const reader =
        new FileReader();

      reader.onload =
        () => {

          avatarData =
            reader.result;

          $("#profileAvatar")
            .src =
              avatarData;
        };

      reader.readAsDataURL(
        file
      );
    }
  );

/* =========================
   SAVE PROFILE
========================= */

$("#saveProfile")
  .onclick =
    async () => {

      try {

        await api(
          "/api/profile",
          {
            method: "POST",

            body:
              JSON.stringify({
                nickname:
                  $("#nickname")
                    .value,

                avatar:
                  avatarData ||
                  player.avatar ||
                  ""
              })
          }
        );

        avatarData =
          "";

        await refreshPlayer();

        await loadTop();

        alert(
          "Профіль збережено ❤️"
        );

      } catch (error) {

        alert(
          error.message
        );
      }
    };

/* =========================
   TABS
========================= */

$$(".tab")
  .forEach(
    button => {

      button.onclick =
        () => {

          $$(".tab")
            .forEach(
              item =>
                item.classList
                  .remove(
                    "active"
                  )
            );

          button.classList
            .add("active");

          $$(".page")
            .forEach(
              page =>
                page.classList
                  .remove(
                    "active"
                  )
            );

          const page =
            $("#" +
              button.dataset.page);

          page.classList
            .add("active");

          if (
            button.dataset.page ===
            "inventory"
          ) {

            loadInventory();
          }

          if (
            button.dataset.page ===
            "top"
          ) {

            loadTop();
          }
        };
    }
  );

/* =========================
   PROFILE BUTTON
========================= */

$("#profileButton")
  .onclick =
    () => {

      document
        .querySelector(
          '[data-page="profile"]'
        )
        .click();
    };

/* =========================
   REAL-TIME LOOT
========================= */

socket.on(
  "loot",
  data => {

    const feed =
      $("#liveFeed");

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "liveItem";

    item.innerHTML = `
      <img
        src="${
          data.avatar ||
          avatarPlaceholder()
        }"
        alt=""
      >

      <div>

        <b>
          ${escapeHtml(
            data.nickname
          )}
        </b>

        отримав

        <span
          class="liveStars"
        >
          ${data.stars} ⭐
        </span>

      </div>
    `;

    feed.prepend(item);

    while (
      feed.children.length >
      20
    ) {

      feed.lastElementChild
        .remove();
    }
  }
);

/* =========================
   HTML ESCAPE
========================= */

function escapeHtml(
  text
) {

  return String(text)
    .replace(
      /[&<>"']/g,
      char => {

        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[char];

      }
    );
}

/* =========================
   START
========================= */

start();
