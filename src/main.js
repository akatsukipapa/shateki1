import './style.css';
import * as THREE from 'three';
import { Game } from './game.js';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

// --- Scene Setup ---
const container = document.getElementById('game-container');
const canvas = document.getElementById('output-canvas');
const videoElement = document.getElementById('input-video');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Handle Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Game Logic ---
const game = new Game(scene, camera);

// --- Inputs ---
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const crosshair = document.getElementById('crosshair');

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  game.start();
  // Ensure AudioContext is resumed (browser policy)
  if (game.audioCtx.state === 'suspended') game.audioCtx.resume();
});

restartBtn.addEventListener('click', () => {
  gameOverScreen.classList.add('hidden');
  game.start();
});


// --- Hand Tracking & Gestures ---
let handResults = null;
const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

hands.onResults((results) => {
  handResults = results;
  processGestures();
});

const cameraUtils = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({image: videoElement});
  },
  width: 640,
  height: 480
});
cameraUtils.start();


// Gesture State
let isPinching = false;
let pinchCooldown = 0;
const PINCH_THRESHOLD = 0.05; // Distance between thumb and index

function processGestures() {
  if (!handResults || !handResults.multiHandLandmarks || handResults.multiHandLandmarks.length === 0) {
    crosshair.style.opacity = '0';
    return;
  }
  
  if (!game.isPlaying) return;

  const landmarks = handResults.multiHandLandmarks[0];
  
  // 1. Position Crosshair (Index Finger Tip: 8)
  const indexTip = landmarks[8];
  
  // Mirror X because webcam is mirrored
  const x = (1 - indexTip.x) * window.innerWidth;
  const y = indexTip.y * window.innerHeight;
  
  crosshair.style.left = `${x}px`;
  crosshair.style.top = `${y}px`;
  crosshair.style.opacity = '1';

  // 2. Detect Pinch (Thumb Tip: 4 vs Index Tip: 8)
  const thumbTip = landmarks[4];
  const distance = Math.sqrt(
    Math.pow(indexTip.x - thumbTip.x, 2) + 
    Math.pow(indexTip.y - thumbTip.y, 2)
  );
  
  if (distance < PINCH_THRESHOLD) {
    if (!isPinching && pinchCooldown <= 0) {
      // Trigger Shot
      fireShot(x, y);
      isPinching = true;
      pinchCooldown = 0.5; // Cooldown in seconds
      crosshair.classList.add('shooting');
    }
  } else {
    isPinching = false;
    crosshair.classList.remove('shooting');
  }
}

function fireShot(screenX, screenY) {
  // Convert screen coords to NDC for Raycaster
  const ndc = new THREE.Vector2();
  ndc.x = (screenX / window.innerWidth) * 2 - 1;
  ndc.y = -(screenY / window.innerHeight) * 2 + 1;
  
  game.shoot(ndc);
}

// --- Main Loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  
  const dt = clock.getDelta();
  if (pinchCooldown > 0) pinchCooldown -= dt;
  
  game.update(dt);
  renderer.render(scene, camera);
}

animate();
