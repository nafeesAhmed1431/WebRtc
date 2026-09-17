const joinPanel = document.getElementById('join-panel');
const callPanel = document.getElementById('call-panel');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const statusEl = document.getElementById('status');

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

let ws;
let pc;
let localStream;

joinBtn.addEventListener('click', () => join(roomInput.value.trim()));

async function join(roomId) {
  if (!roomId) return;

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  joinPanel.hidden = true;
  callPanel.hidden = false;

  ws = new WebSocket(`ws://${location.host}`);

  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', roomId }));

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'joined':
        statusEl.textContent = msg.initiator ? 'Waiting for peer...' : 'Peer found, connecting...';
        setupPeerConnection();
        break;

      case 'peer-joined':
        // we were first in the room; now that a peer arrived, make the offer
        await makeOffer();
        break;

      case 'full':
        statusEl.textContent = 'Room is full.';
        break;

      case 'offer':
        setupPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', sdp: answer }));
        break;

      case 'answer':
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;

      case 'ice-candidate':
        if (msg.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (err) {
            console.error('Error adding ICE candidate', err);
          }
        }
        break;

      case 'peer-left':
        statusEl.textContent = 'Peer disconnected.';
        remoteVideo.srcObject = null;
        break;
    }
  };
}

function setupPeerConnection() {
  if (pc) return;

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    statusEl.textContent = 'Connected';
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
    }
  };
}

async function makeOffer() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', sdp: offer }));
}
