import * as THREE from "three";

export class Game {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.score = 0;
    this.totalTime = 30; // 30 seconds
    this.timeLeft = this.totalTime;
    this.isPlaying = false;
    this.dolls = [];
    this.raycaster = new THREE.Raycaster();

    // SFX (Oscillator based for simplicity, or placeholders)
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    this.initWorld();
  }

  initWorld() {
    // 1. Background Image
    const loader = new THREE.TextureLoader();
    loader.load("/bg.png", (texture) => {
      const aspectRatio = texture.image.width / texture.image.height;
      const planeHeight = 20; // Arbitrary world units height
      const planeWidth = planeHeight * aspectRatio;

      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const plane = new THREE.Mesh(geometry, material);
      plane.position.z = -15; // Background depth
      this.scene.add(plane);

      // Setup dolls based on approximate visuals of the image
      // Assuming shelves are at specific heights.
      // Image has 3 shelves roughly.
      // We will place transparent hitboxes or visual 3D dolls.
      // Since user wants "3D feel", we'll put crude 3D dolls.
      this.createDolls(planeWidth, planeHeight);
    });

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(0, 10, 10);
    this.scene.add(dirLight);
  }

  createDolls(bgWidth, bgHeight) {
    // Shelf positions (tuned by eye relative to bg size 20 height)
    // Center is (0,0). Bg goes roughly from -10 to +10 Y.
    const shelfY = [2, -1, -4];
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];

    // Create a simple doll geometry
    const dollGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16);

    // Add multiple dolls per shelf
    shelfY.forEach((y, layerIndex) => {
      const count = 5 + layerIndex; // More dolls on lower shelves
      const spacing = (bgWidth * 0.6) / count;

      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * spacing;
        const color = colors[(i + layerIndex) % colors.length];
        const material = new THREE.MeshStandardMaterial({ color: color });
        const doll = new THREE.Mesh(dollGeo, material);

        doll.position.set(x, y, -12 + layerIndex * 1.5); // Stagger depth slightly
        doll.userData = {
          isTarget: true,
          points: (3 - layerIndex) * 10, // Higher score for top shelf (harder to hit? actually usually top is 1st shelf)
          state: "standing", // standing, falling, fallen
        };

        // Pivot group to make it fall backward from bottom
        const pivot = new THREE.Group();
        pivot.position.set(x, y - 0.6, -12 + layerIndex * 1.5); // Pivot at base
        doll.position.set(0, 0.6, 0); // Offset geometry
        pivot.add(doll);

        this.scene.add(pivot);
        this.dolls.push(pivot);
      }
    });
  }

  start() {
    this.score = 0;
    this.timeLeft = this.totalTime;
    this.isPlaying = true;
    this.updateUI();

    // Reset dolls
    this.dolls.forEach((pivot) => {
      pivot.rotation.x = 0;
      pivot.children[0].userData.state = "standing";
    });
  }

  update(dt) {
    if (!this.isPlaying) return;

    // Timer
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endGame();
    }

    // Animate falling dolls
    this.dolls.forEach((pivot) => {
      const doll = pivot.children[0];
      if (doll.userData.state === "falling") {
        const fallSpeed = 5 * dt;
        pivot.rotation.x -= fallSpeed;
        if (pivot.rotation.x < -Math.PI / 2) {
          pivot.rotation.x = -Math.PI / 2;
          doll.userData.state = "fallen";
        }
      }
    });

    this.updateUI();
  }

  shoot(ndc) {
    if (!this.isPlaying) return;

    this.raycaster.setFromCamera(ndc, this.camera);

    // Get meshes from pivots
    const targets = this.dolls.map((p) => p.children[0]);
    const intersects = this.raycaster.intersectObjects(targets);

    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      if (hitObj.userData.state === "standing") {
        // Hit!
        hitObj.userData.state = "falling";
        this.score += hitObj.userData.points;
        this.playHitSound();
        return true;
      }
    }
    this.playShootSound(); // Miss sound if no hit
    return false;
  }

  updateUI() {
    document.getElementById("score").innerText = this.score;
    const bar = document.getElementById("time-bar");
    const pct = (this.timeLeft / 60) * 100;
    bar.style.transform = `scaleX(${pct / 100})`;

    // Change color on low time
    if (pct < 20) bar.style.background = "#ff0000";
    else bar.style.background = "linear-gradient(90deg, #ff8c00, #ff0000)";
  }

  endGame() {
    this.isPlaying = false;
    document.getElementById("game-over-screen").classList.remove("hidden");
    document.getElementById("final-score").innerText = this.score;
    // Hide crosshair
    document.getElementById("crosshair").style.opacity = "0";
  }

  playHitSound() {
    // Simple synthesized beep
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.type = "square";
    osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      880,
      this.audioCtx.currentTime + 0.1
    );

    gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioCtx.currentTime + 0.1
    );

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.1);
  }

  playShootSound() {
    // Pew pew
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      100,
      this.audioCtx.currentTime + 0.15
    );

    gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioCtx.currentTime + 0.15
    );

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.15);
  }
}
