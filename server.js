const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;

const DATABASE_URL = process.env.DATABASE_URL || "";

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "";

const TELEGRAM_CHANNEL =
  process.env.TELEGRAM_CHANNEL ||
  "@rozdacha_zvezd";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost")
    ? false
    : {
        rejectUnauthorized: false
      }
});

app.use(
  express.json({
    limit: "8mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "8mb"
  })
);

/*
  ВАЖНО:
  Никакой public.
  Все файлы лежат в корне.
*/

app.use(
  express.static(__dirname)
);

/* =========================
   CASES
========================= */

const CASES = {
  free: {
    id: "free",
    name: "FREE",
    price: 0,
    image: "/images/cases/free.png",
    cooldown: 24 * 60 * 60 * 1000
  },

  prostars: {
    id: "prostars",
    name: "PROSTARS",
    price: 100,
    image: "/images/cases/prostars.png"
  },

  nft: {
    id: "nft",
    name: "NFT GIFT",
    price: 1000,
    image: "/images/cases/nft.png"
  }
};

/*
  Шанси.

  Для NFT задані ваги відповідно до
  категорій, які ти описав.

  Оскільки сума твоїх указаних процентів
  виходить понад 100%, система нормалізує
  ваги автоматично.
*/

const PRIZES = {
  free: [
    {
      id: "free-1",
      stars: 1,
      image: "/images/prizes/1.png",
      weight: 100
    }
  ],

  prostars: [
    {
      id: "pro-1",
      stars: 1,
      image: "/images/prizes/1.png",
      weight: 40
    },

    {
      id: "pro-2",
      stars: 2,
      image: "/images/prizes/2.png",
      weight: 25
    },

    {
      id: "pro-3",
      stars: 3,
      image: "/images/prizes/3.png",
      weight: 20
    },

    {
      id: "pro-4",
      stars: 4,
      image: "/images/prizes/4.png",
      weight: 10
    },

    {
      id: "pro-5",
      stars: 5,
      image: "/images/prizes/5.png",
      weight: 5
    }
  ],

  nft: [
    {
      id: "nft-1",
      stars: 1,
      image: "/images/prizes/1.png",
      weight: 70
    },

    {
      id: "nft-2",
      stars: 2,
      image: "/images/prizes/2.png",
      weight: 10
    },

    {
      id: "nft-3",
      stars: 3,
      image: "/images/prizes/3.png",
      weight: 10
    },

    {
      id: "nft-4",
      stars: 4,
      image: "/images/prizes/4.png",
      weight: 5
    },

    {
      id: "nft-5",
      stars: 5,
      image: "/images/prizes/5.png",
      weight: 5
    },

    {
      id: "nft-15",
      stars: 15,
      image: "/images/prizes/15.png",
      weight: 1.666666
    },

    {
      id: "nft-50",
      stars: 50,
      image: "/images/prizes/50.png",
      weight: 1.666666
    },

    {
      id: "nft-100",
      stars: 100,
      image: "/images/prizes/100.png",
      weight: 1.666668
    },

    {
      id: "nft-350",
      stars: 350,
      image: "/images/prizes/350.png",
      weight: 0.333333
    },

    {
      id: "nft-1000",
      stars: 1000,
      image: "/images/prizes/1000.png",
      weight: 0.333333
    },

    {
      id: "nft-1500",
      stars: 1500,
      image: "/images/prizes/1500.png",
      weight: 0.333334
    },

    {
      id: "nft-5000",
      stars: 5000,
      image: "/images/prizes/5000.png",
      weight: 0.0001
    }
  ]
};

/* =========================
   DATABASE
========================= */

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,

      nickname TEXT
        NOT NULL
        DEFAULT 'Player',

      avatar TEXT
        DEFAULT '',

      stars BIGINT
        NOT NULL
        DEFAULT 0,

      earned BIGINT
        NOT NULL
        DEFAULT 0,

      spent BIGINT
        NOT NULL
        DEFAULT 0,

      last_free TIMESTAMPTZ,

      created_at TIMESTAMPTZ
        DEFAULT NOW(),

      updated_at TIMESTAMPTZ
        DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS inventory (
      id BIGSERIAL PRIMARY KEY,

      player_id TEXT
        NOT NULL
        REFERENCES players(id)
        ON DELETE CASCADE,

      case_id TEXT
        NOT NULL,

      prize_id TEXT
        NOT NULL,

      stars BIGINT
        NOT NULL,

      image TEXT
        DEFAULT '',

      created_at TIMESTAMPTZ
        DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS player_sessions (
      player_id TEXT PRIMARY KEY,

      last_seen TIMESTAMPTZ
        DEFAULT NOW()
    )
  `);

  console.log("PostgreSQL database initialized");
}

/* =========================
   HELPERS
========================= */

function getPlayerId(req) {
  return String(
    req.headers["x-player-id"] || ""
  );
}

function validPlayerId(id) {
  return id.length >= 10 && id.length <= 100;
}

async function createPlayer(id) {
  await query(
    `
    INSERT INTO players(id)
    VALUES($1)
    ON CONFLICT(id)
    DO NOTHING
    `,
    [id]
  );

  await query(
    `
    INSERT INTO player_sessions(
      player_id,
      last_seen
    )
    VALUES($1,NOW())
    ON CONFLICT(player_id)
    DO UPDATE SET
      last_seen = NOW()
    `,
    [id]
  );
}

function randomPrize(caseId) {
  const prizes =
    PRIZES[caseId];

  const total =
    prizes.reduce(
      (sum, prize) =>
        sum + Number(prize.weight),
      0
    );

  let random =
    Math.random() * total;

  for (const prize of prizes) {
    random -=
      Number(prize.weight);

    if (random <= 0) {
      return prize;
    }
  }

  return prizes[prizes.length - 1];
}

async function checkTelegramSubscription(
  telegramId
) {
  if (!TELEGRAM_BOT_TOKEN) {
    return false;
  }

  if (!telegramId) {
    return false;
  }

  try {
    const url =
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` +
      `/getChatMember?chat_id=${encodeURIComponent(
        TELEGRAM_CHANNEL
      )}` +
      `&user_id=${encodeURIComponent(
        telegramId
      )}`;

    const response =
      await fetch(url);

    const data =
      await response.json();

    if (!data.ok) {
      return false;
    }

    const status =
      data.result?.status;

    return [
      "creator",
      "administrator",
      "member"
    ].includes(status);

  } catch (error) {
    console.error(
      "Telegram error:",
      error.message
    );

    return false;
  }
}

/* =========================
   CONFIG
========================= */

app.get(
  "/api/config",
  (req, res) => {

    res.json({
      cases: CASES,
      prizes: PRIZES,
      channel: TELEGRAM_CHANNEL
    });

  }
);

/* =========================
   PLAYER
========================= */

app.post(
  "/api/player",
  async (req, res) => {

    try {

      let id =
        getPlayerId(req);

      if (!validPlayerId(id)) {

        id =
          crypto.randomUUID();
      }

      await createPlayer(id);

      const result =
        await query(
          `
          SELECT
            id,
            nickname,
            avatar,
            stars,
            earned,
            spent,
            last_free
          FROM players
          WHERE id=$1
          `,
          [id]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Не вдалося завантажити профіль"
      });
    }
  }
);

/* =========================
   PROFILE
========================= */

app.post(
  "/api/profile",
  async (req, res) => {

    try {

      const id =
        getPlayerId(req);

      if (!validPlayerId(id)) {

        return res.status(400).json({
          error:
            "Невірний Player ID"
        });
      }

      let nickname =
        String(
          req.body.nickname ||
          "Player"
        )
        .trim()
        .slice(0, 24);

      if (!nickname) {
        nickname = "Player";
      }

      const avatar =
        String(
          req.body.avatar || ""
        );

      if (
        avatar.length >
        3 * 1024 * 1024
      ) {

        return res.status(400).json({
          error:
            "Аватар занадто великий"
        });
      }

      await createPlayer(id);

      await query(
        `
        UPDATE players
        SET
          nickname=$1,
          avatar=$2,
          updated_at=NOW()
        WHERE id=$3
        `,
        [
          nickname,
          avatar,
          id
        ]
      );

      res.json({
        ok: true
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Не вдалося зберегти профіль"
      });
    }
  }
);

/* =========================
   INVENTORY
========================= */

app.get(
  "/api/inventory",
  async (req, res) => {

    try {

      const id =
        getPlayerId(req);

      if (!validPlayerId(id)) {
        return res.json([]);
      }

      const result =
        await query(
          `
          SELECT
            id,
            case_id,
            prize_id,
            stars,
            image,
            created_at
          FROM inventory
          WHERE player_id=$1
          ORDER BY id DESC
          `,
          [id]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Не вдалося завантажити інвентар"
      });
    }
  }
);

/* =========================
   SELL ITEM
========================= */

app.post(
  "/api/inventory/:id/sell",
  async (req, res) => {

    const playerId =
      getPlayerId(req);

    const itemId =
      Number(req.params.id);

    const client =
      await pool.connect();

    try {

      await client.query(
        "BEGIN"
      );

      const result =
        await client.query(
          `
          DELETE FROM inventory
          WHERE id=$1
            AND player_id=$2
          RETURNING stars
          `,
          [
            itemId,
            playerId
          ]
        );

      if (!result.rows.length) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          error:
            "Предмет не знайдено"
        });
      }

      const stars =
        Number(
          result.rows[0].stars
        );

      await client.query(
        `
        UPDATE players
        SET
          stars=stars+$1,
          updated_at=NOW()
        WHERE id=$2
        `,
        [
          stars,
          playerId
        ]
      );

      await client.query(
        "COMMIT"
      );

      res.json({
        ok: true,
        stars
      });

    } catch (error) {

      await client.query(
        "ROLLBACK"
      );

      console.error(error);

      res.status(500).json({
        error:
          "Не вдалося продати предмет"
      });

    } finally {

      client.release();
    }
  }
);

/* =========================
   OPEN CASE
========================= */

app.post(
  "/api/open",
  async (req, res) => {

    const playerId =
      getPlayerId(req);

    const caseId =
      String(
        req.body.caseId || ""
      );

    if (!validPlayerId(playerId)) {

      return res.status(400).json({
        error:
          "Player ID missing"
      });
    }

    if (!CASES[caseId]) {

      return res.status(400).json({
        error:
          "Невідомий кейс"
      });
    }

    const client =
      await pool.connect();

    try {

      await client.query(
        "BEGIN"
      );

      const result =
        await client.query(
          `
          SELECT *
          FROM players
          WHERE id=$1
          FOR UPDATE
          `,
          [playerId]
        );

      if (!result.rows.length) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          error:
            "Гравця не знайдено"
        });
      }

      const player =
        result.rows[0];

      /* FREE */

      if (caseId === "free") {

        if (
          player.last_free
        ) {

          const elapsed =
            Date.now() -
            new Date(
              player.last_free
            ).getTime();

          if (
            elapsed <
            CASES.free.cooldown
          ) {

            const remaining =
              CASES.free.cooldown -
              elapsed;

            await client.query(
              "ROLLBACK"
            );

            return res.status(429).json({
              error:
                "FREE кейс ще недоступний",
              remaining
            });
          }
        }

        const telegramId =
          String(
            req.body.telegramId ||
            ""
          ).trim();

        const subscribed =
          await checkTelegramSubscription(
            telegramId
          );

        if (!subscribed) {

          await client.query(
            "ROLLBACK"
          );

          return res.status(403).json({
            error:
              "Потрібна підписка на @rozdacha_zvezd",
            telegramRequired:
              true
          });
        }
      }

      /* PAID */

      if (
        caseId !== "free"
      ) {

        const price =
          CASES[caseId].price;

        if (
          Number(player.stars) <
          price
        ) {

          await client.query(
            "ROLLBACK"
          );

          return res.status(400).json({
            error:
              "Недостатньо ⭐"
          });
        }

        await client.query(
          `
          UPDATE players
          SET
            stars=stars-$1,
            spent=spent+$1,
            updated_at=NOW()
          WHERE id=$2
          `,
          [
            price,
            playerId
          ]
        );
      }

      /* PRIZE */

      const prize =
        randomPrize(caseId);

      /* INVENTORY */

      await client.query(
        `
        INSERT INTO inventory(
          player_id,
          case_id,
          prize_id,
          stars,
          image
        )
        VALUES(
          $1,$2,$3,$4,$5
        )
        `,
        [
          playerId,
          caseId,
          prize.id,
          prize.stars,
          prize.image
        ]
      );

      /* BALANCE */

      await client.query(
        `
        UPDATE players
        SET
          stars=stars+$1,
          earned=earned+$1,

          last_free=
            CASE
              WHEN $2='free'
              THEN NOW()
              ELSE last_free
            END,

          updated_at=NOW()

        WHERE id=$3
        `,
        [
          prize.stars,
          caseId,
          playerId
        ]
      );

      await client.query(
        "COMMIT"
      );

      /* LIVE FEED */

      io.emit(
        "loot",
        {
          nickname:
            player.nickname,

          avatar:
            player.avatar,

          caseId,

          stars:
            Number(prize.stars),

          image:
            prize.image,

          time:
            Date.now()
        }
      );

      res.json({
        ok: true,

        prize: {
          id:
            prize.id,

          stars:
            prize.stars,

          image:
            prize.image
        }
      });

    } catch (error) {

      console.error(error);

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      res.status(500).json({
        error:
          "Помилка сервера"
      });

    } finally {

      client.release();
    }
  }
);

/* =========================
   TOP 100
========================= */

app.get(
  "/api/top",
  async (req, res) => {

    try {

      const result =
        await query(
          `
          SELECT
            nickname,
            avatar,
            earned,
            stars
          FROM players
          ORDER BY
            earned DESC,
            stars DESC
          LIMIT 100
          `
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Не вдалося завантажити ТОП"
      });
    }
  }
);

/* =========================
   HEALTH CHECK
========================= */

app.get(
  "/api/health",
  async (req, res) => {

    try {

      await query(
        "SELECT 1"
      );

      res.json({
        ok: true,
        database: true
      });

    } catch {

      res.status(500).json({
        ok: false,
        database: false
      });
    }
  }
);

/*
  SPA FALLBACK.

  НЕ використовуємо app.get("*"),
  тому Express 5 не видасть
  Missing parameter name.
*/

app.use(
  (req, res, next) => {

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {

      return res.status(404).json({
        error:
          "API route not found"
      });
    }

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

/* =========================
   START
========================= */

initDatabase()
  .then(() => {

    server.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `PROSTARS started on port ${PORT}`
        );

      }
    );

  })
  .catch(error => {

    console.error(
      "DATABASE ERROR:",
      error
    );

    process.exit(1);
  });
