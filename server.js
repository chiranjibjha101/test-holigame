const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let roles = { P1: null, P2: null };
let names = { P1: "Player 1", P2: "Player 2" };
let players = {};
let scores = { P1: 0, P2: 0 };
let splatters = [];

function makeSplatters(x, y, color, count = 5, spread = 40, size = [5, 20]) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * spread,
      radius: Math.random() * (size[1] - size[0]) + size[0],
      color,
    });
  }
  return out;
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);
  socket.emit("rolesUpdate", roles);
  socket.emit("namesUpdate", names);

  socket.on("joinGame", ({ role, name }) => {
    if (role === "P1" && !roles.P1) {
      roles.P1 = socket.id;
      names.P1 = name || "Player 1";
    } else if (role === "P2" && !roles.P2) {
      roles.P2 = socket.id;
      names.P2 = name || "Player 2";
    } else if (role !== "Spectator") {
      return socket.emit("roleError", "This slot is already taken!");
    }

    if (role !== "Spectator") {
      players[socket.id] = {
        id: socket.id,
        role,
        name: names[role],
        x: role === "P1" ? 100 : 700,
        y: 250,
        color: role === "P1" ? "#3d9fff" : "#ff3d5a",
        dx: role === "P1" ? 1 : -1,
        dy: 0,
      };
    }

    socket.emit("init", { role, players, scores, splatters, names });
    io.emit("stateUpdate", { players });
    io.emit("rolesUpdate", roles);
    io.emit("namesUpdate", names);
  });

  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].dx = data.dx;
      players[socket.id].dy = data.dy;
      socket.broadcast.emit("stateUpdate", { players });
    }
  });

  socket.on("shoot", (b) => {
    b.type = "balloon";
    io.emit("balloonFired", b);
  });
  socket.on("pichkariShoot", (arr) => {
    arr.forEach((b) => (b.type = "pichkari"));
    io.emit("pichkariFired", arr);
  });
  socket.on("bombShoot", (b) => {
    b.type = "bomb";
    io.emit("bombFired", b);
  });
  socket.on("burstShoot", (arr) => {
    arr.forEach((b) => (b.type = "burst"));
    io.emit("burstFired", arr);
  });

  socket.on("hit", (data) => {
    if (data.hitRole === "P1") scores.P2++;
    if (data.hitRole === "P2") scores.P1++;

    let count = 5,
      spread = 40,
      size = [5, 20];
    if (data.type === "bomb") {
      count = 20;
      spread = 80;
      size = [8, 28];
    }
    if (data.type === "burst") {
      count = 10;
      spread = 55;
      size = [6, 22];
    }
    if (data.type === "pichkari") {
      count = 6;
      spread = 25;
      size = [3, 12];
    }

    const newSplatters = makeSplatters(
      data.x,
      data.y,
      data.color,
      count,
      spread,
      size
    );

    if (data.type === "bomb") {
      ["#00E676", "#2979FF", "#FFEA00", "#FF4081", "#FF6D00"].forEach((c) => {
        newSplatters.push(
          ...makeSplatters(
            data.x + (Math.random() - 0.5) * 60,
            data.y + (Math.random() - 0.5) * 60,
            c,
            4,
            30,
            [4, 15]
          )
        );
      });
    }

    splatters.push(...newSplatters);
    if (splatters.length > 500) splatters.splice(0, newSplatters.length);

    io.emit("scoreUpdate", scores);
    io.emit("splatterAdded", newSplatters);
    io.emit("hitNotify", {
      victimId: data.victimId,
      color: data.color,
      type: data.type,
    });
  });

  socket.on("resetGame", () => {
    scores = { P1: 0, P2: 0 };
    splatters = [];
    for (let id in players) {
      const p = players[id];
      p.x = p.role === "P1" ? 100 : 700;
      p.y = 250;
      p.dx = p.role === "P1" ? 1 : -1;
      p.dy = 0;
    }
    io.emit("gameReset", { players, scores, splatters });
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    if (roles.P1 === socket.id) {
      roles.P1 = null;
      names.P1 = "Player 1";
    }
    if (roles.P2 === socket.id) {
      roles.P2 = null;
      names.P2 = "Player 2";
    }
    delete players[socket.id];
    io.emit("stateUpdate", { players });
    io.emit("rolesUpdate", roles);
    io.emit("namesUpdate", names);
  });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Holi Game running on port ${PORT}`)
);
