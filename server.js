const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let roles = { Rahul: null, Rashmi: null };
let players = {};
let scores = { Rahul: 0, Rashmi: 0 };
let splatters = [];

// Helper: create splatters around a point, more for bombs
function makeSplatters(x, y, color, count = 5, spread = 40, size = [5, 20]) {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push({
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * spread,
      radius: Math.random() * (size[1] - size[0]) + size[0],
      color,
    });
  }
  return result;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  socket.emit("rolesUpdate", roles);

  // ─── Join Game ───────────────────────────────────────────────
  socket.on("joinGame", (requestedRole) => {
    if (requestedRole === "Rahul" && !roles.Rahul) {
      roles.Rahul = socket.id;
    } else if (requestedRole === "Rashmi" && !roles.Rashmi) {
      roles.Rashmi = socket.id;
    } else if (requestedRole !== "Spectator") {
      return socket.emit("roleError", "This character is already taken!");
    }

    const myRole = requestedRole;

    if (myRole !== "Spectator") {
      players[socket.id] = {
        id: socket.id,
        role: myRole,
        x: myRole === "Rahul" ? 100 : 700,
        y: 250,
        color: myRole === "Rahul" ? "#3498db" : "#e74c3c",
        dx: myRole === "Rahul" ? 1 : -1,
        dy: 0,
      };
    }

    socket.emit("init", { role: myRole, players, scores, splatters });
    io.emit("stateUpdate", { players });
    io.emit("rolesUpdate", roles);
  });

  // ─── Movement ────────────────────────────────────────────────
  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].dx = data.dx;
      players[socket.id].dy = data.dy;
      socket.broadcast.emit("stateUpdate", { players });
    }
  });

  // ─── Balloon ─────────────────────────────────────────────────
  socket.on("shoot", (balloon) => {
    balloon.type = "balloon";
    io.emit("balloonFired", balloon);
  });

  // ─── Pichkari (stream of droplets) ───────────────────────────
  socket.on("pichkariShoot", (stream) => {
    stream.forEach((s) => {
      s.type = "pichkari";
    });
    io.emit("pichkariFired", stream);
  });

  // ─── Bomb ────────────────────────────────────────────────────
  socket.on("bombShoot", (bomb) => {
    bomb.type = "bomb";
    io.emit("bombFired", bomb);
  });

  // ─── Burst (8-way spread) ─────────────────────────────────────
  socket.on("burstShoot", (burstArr) => {
    burstArr.forEach((b) => {
      b.type = "burst";
    });
    io.emit("burstFired", burstArr);
  });

  // ─── Hit Detection ────────────────────────────────────────────
  socket.on("hit", (data) => {
    if (data.hitRole === "Rahul") scores.Rashmi++;
    if (data.hitRole === "Rashmi") scores.Rahul++;

    // More splatters for heavier weapons
    let count = 5,
      spread = 40,
      size = [5, 20];
    if (data.type === "bomb") {
      count = 20;
      spread = 80;
      size = [8, 28];
    } else if (data.type === "burst") {
      count = 10;
      spread = 55;
      size = [6, 22];
    } else if (data.type === "pichkari") {
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

    // For bombs, add rainbow splatters too
    if (data.type === "bomb") {
      const extraColors = [
        "#00E676",
        "#2979FF",
        "#FFEA00",
        "#FF4081",
        "#FF6D00",
      ];
      extraColors.forEach((c) => {
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

    // Notify victim
    io.emit("hitNotify", {
      victimId: data.victimId,
      color: data.color,
      type: data.type,
    });
  });

  // ─── Reset ────────────────────────────────────────────────────
  socket.on("resetGame", () => {
    scores = { Rahul: 0, Rashmi: 0 };
    splatters = [];
    for (let id in players) {
      const p = players[id];
      p.x = p.role === "Rahul" ? 100 : 700;
      p.y = 250;
      p.dx = p.role === "Rahul" ? 1 : -1;
      p.dy = 0;
    }
    io.emit("gameReset", { players, scores, splatters });
  });

  // ─── Disconnect ───────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    if (roles.Rahul === socket.id) roles.Rahul = null;
    if (roles.Rashmi === socket.id) roles.Rashmi = null;
    delete players[socket.id];
    io.emit("stateUpdate", { players });
    io.emit("rolesUpdate", roles);
  });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🎨 Holi Game running on port ${PORT}`);
});
