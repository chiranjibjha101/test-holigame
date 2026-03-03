const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// The frontend will actually be served by NGINX in production,
// but this is kept here so the backend container can serve it if tested independently.
app.use(express.static("public"));

let roles = { Rahul: null, Rashmi: null };
let players = {};
let scores = { Rahul: 0, Rashmi: 0 };
let splatters = []; // Stores the color stains on the ground

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Assign Role (First is Rahul, Second is Rashmi, rest are Spectators)
  let myRole = "Spectator";
  if (!roles.Rahul) {
    myRole = "Rahul";
    roles.Rahul = socket.id;
  } else if (!roles.Rashmi) {
    myRole = "Rashmi";
    roles.Rashmi = socket.id;
  }

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

  // Send initial state to the newly connected user
  socket.emit("init", { role: myRole, players, scores, splatters });
  // Tell everyone else a new player joined
  socket.broadcast.emit("stateUpdate", { players });

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
    // Update score
    if (data.hitRole === "Rahul") scores.Rashmi++;
    if (data.hitRole === "Rashmi") scores.Rahul++;

    // Generate splatter marks
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
    if (splatters.length > 300) splatters.splice(0, 5); // Prevent memory lag

    io.emit("scoreUpdate", scores);
    io.emit("splatterAdded", newSplatters);
  });

  // Handle Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    if (roles.Rahul === socket.id) roles.Rahul = null;
    if (roles.Rashmi === socket.id) roles.Rashmi = null;
    delete players[socket.id];
    io.emit("stateUpdate", { players });
  });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Holi Game Backend running on port ${PORT}`);
});
