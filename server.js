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

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Send available roles immediately when a user connects
  socket.emit("rolesUpdate", roles);

  // Handle character selection
  socket.on("joinGame", (requestedRole) => {
    if (requestedRole === "Rahul" && !roles.Rahul) {
      roles.Rahul = socket.id;
    } else if (requestedRole === "Rashmi" && !roles.Rashmi) {
      roles.Rashmi = socket.id;
    } else if (requestedRole !== "Spectator") {
      return socket.emit("roleError", "This character is already taken!");
    }

    let myRole = requestedRole;

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

    // Send game state to the joined player
    socket.emit("init", { role: myRole, players, scores, splatters });
    // Update everyone else
    io.emit("stateUpdate", { players });
    io.emit("rolesUpdate", roles);
  });

  // Handle Movement
  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].dx = data.dx;
      players[socket.id].dy = data.dy;
      socket.broadcast.emit("stateUpdate", { players });
    }
  });

  // Handle Shooting
  socket.on("shoot", (balloon) => {
    io.emit("balloonFired", balloon);
  });

  // Handle Hits & Splatters
  socket.on("hit", (data) => {
    if (data.hitRole === "Rahul") scores.Rashmi++;
    if (data.hitRole === "Rashmi") scores.Rahul++;

    const newSplatters = [];
    for (let i = 0; i < 5; i++) {
      newSplatters.push({
        x: data.x + (Math.random() - 0.5) * 40,
        y: data.y + (Math.random() - 0.5) * 40,
        radius: Math.random() * 15 + 5,
        color: data.color,
      });
    }
    splatters.push(...newSplatters);
    if (splatters.length > 300) splatters.splice(0, 5);

    io.emit("scoreUpdate", scores);
    io.emit("splatterAdded", newSplatters);
  });

  // Handle Game Reset
  socket.on("resetGame", () => {
    scores = { Rahul: 0, Rashmi: 0 };
    splatters = [];
    // Reset player positions
    for (let id in players) {
      let p = players[id];
      p.x = p.role === "Rahul" ? 100 : 700;
      p.y = 250;
      p.dx = p.role === "Rahul" ? 1 : -1;
      p.dy = 0;
    }
    io.emit("gameReset", { players, scores, splatters });
  });

  // Handle Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    if (roles.Rahul === socket.id) roles.Rahul = null;
    if (roles.Rashmi === socket.id) roles.Rashmi = null;
    delete players[socket.id];

    io.emit("stateUpdate", { players });
    io.emit("rolesUpdate", roles); // Notify clients a character is free again
  });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Holi Game Backend running on port ${PORT}`);
});
