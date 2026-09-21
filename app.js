const socket = io();

const home = document.getElementById("home");
const call = document.getElementById("call");
const createRoom = document.getElementById("createRoom");
const roomUrl = document.getElementById("roomUrl");
const copyLink = document.getElementById("copyLink");
const statusEl = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const muteButton = document.getElementById("mute");
const cameraButton = document.getElementById("camera");
const hangupButton = document.getElementById("hangup");

const roomId = getRoomIdFromUrl();
let localStream = null;
let peerConnection = null;
let joinedAsFirst = false;
let micOn = true;
let cameraOn = true;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

function getRoomIdFromUrl() {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts[0] || null;
}

function makeRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

createRoom.addEventListener("click", () => {
  location.href = "/" + makeRoomId();
});

async function start() {
  home.classList.add("hidden");
  call.classList.remove("hidden");

  roomUrl.textContent = location.href;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
    setStatus("カメラ・マイク準備OK。相手を待っています…");

    socket.emit("join-room", roomId, (result) => {
      if (!result?.ok) {
        setStatus(result?.error || "部屋に入れませんでした。");
        return;
      }

      joinedAsFirst = result.isFirst;
      if (!joinedAsFirst) {
        setStatus("相手が見つかりました。接続中…");
        createOffer();
      }
    });
  } catch (err) {
    console.error(err);
    setStatus("カメラ・マイクを使用できませんでした。ブラウザの許可設定を確認してください。");
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function createPeerConnection() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(rtcConfig);

  for (const track of localStream.getTracks()) {
    peerConnection.addTrack(track, localStream);
  }

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    setStatus("通話中");
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        roomId,
        candidate: event.candidate
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === "connected") setStatus("通話中");
    if (state === "disconnected") setStatus("接続が切れました。");
    if (state === "failed") setStatus("接続に失敗しました。");
  };

  return peerConnection;
}

async function createOffer() {
  const pc = createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("offer", { roomId, offer });
}

socket.on("peer-joined", async () => {
  if (!peerConnection) {
    setStatus("相手が参加しました。接続中…");
    await createOffer();
  }
});

socket.on("offer", async (offer) => {
  const pc = createPeerConnection();

  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", {
    roomId,
    answer
  });
});

socket.on("answer", async (answer) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(answer);
});

socket.on("ice-candidate", async (candidate) => {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(candidate);
    }
  } catch (err) {
    console.error("ICE candidate error:", err);
  }
});

socket.on("peer-left", () => {
  remoteVideo.srcObject = null;
  setStatus("相手が退出しました。相手が戻るのを待っています…");

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
});

muteButton.addEventListener("click", () => {
  micOn = !micOn;
  localStream?.getAudioTracks().forEach(track => track.enabled = micOn);
  muteButton.textContent = micOn ? "🎤 ミュート" : "🔇 ミュート解除";
});

cameraButton.addEventListener("click", () => {
  cameraOn = !cameraOn;
  localStream?.getVideoTracks().forEach(track => track.enabled = cameraOn);
  cameraButton.textContent = cameraOn ? "📷 カメラOFF" : "📷 カメラON";
});

copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    copyLink.textContent = "コピーしました！";
    setTimeout(() => copyLink.textContent = "URLをコピー", 1500);
  } catch {
    alert("URLをコピーできませんでした。アドレスバーからコピーしてください。");
  }
});

hangupButton.addEventListener("click", () => {
  socket.emit("leave-room");

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  location.href = "/";
});

if (roomId) {
  start();
}
