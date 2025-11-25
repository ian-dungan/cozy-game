// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    pixelArt: true,
    backgroundColor: '#5d8a6e',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// Game variables
let player;
let cursors;
let score = 0;
let scoreText;
let gameOver = false;
let coins;
let bombs;
let platforms;
let stars;
let particles;
let emitter;
let collectSound;
let jumpSound;
let gameOverSound;
let light;
let isMobile = false;

// Initialize the game
const game = new Phaser.Game(config);

function preload() {
    // Load assets
    this.load.setBaseURL('https://labs.phaser.io');
    
    // Player
    this.load.spritesheet('dude', 'assets/games/firstgame/dude.png', {
        frameWidth: 32,
        frameHeight: 48
    });
    
    // Platforms
    this.load.image('ground', 'assets/skies/background1.png');
    this.load.image('platform', 'assets/skies/background2.png');
    
    // Collectibles
    this.load.image('coin', 'assets/sprites/coin.png');
    this.load.image('bomb', 'assets/sprites/bomb.png');
    this.load.image('star', 'assets/particles/blue.png');
    
    // Sounds
    this.load.audio('collect', 'assets/audio/official/soundfx/coin2.wav');
    this.load.audio('jump', 'assets/audio/official/soundfx/jump.wav');
    this.load.audio('gameOver', 'assets/audio/official/soundfx/gameover.mp3');
    
    // Update loading progress
    this.load.on('progress', (value) => {
        document.querySelector('.loading-bar-fill').style.width = `${value * 100}%`;
    });
}

function create() {
    // Create world bounds
    this.physics.world.setBounds(0, 0, 1600, 600);
    
    // Create platforms
    platforms = this.physics.add.staticGroup();
    
    // Add ground
    platforms.create(400, 568, 'ground').setScale(2).refreshBody();
    
    // Add other platforms
    platforms.create(600, 400, 'platform');
    platforms.create(50, 250, 'platform');
    platforms.create(750, 220, 'platform');
    
    // Create player
    player = this.physics.add.sprite(100, 450, 'dude');
    player.setBounce(0.2);
    player.setCollideWorldBounds(true);
    
    // Player animations
    this.anims.create({
        key: 'left',
        frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1
    });
    
    this.anims.create({
        key: 'turn',
        frames: [ { key: 'dude', frame: 4 } ],
        frameRate: 20
    });
    
    this.anims.create({
        key: 'right',
        frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
        frameRate: 10,
        repeat: -1
    });
    
    // Create coins
    coins = this.physics.add.group();
    for (let i = 0; i < 12; i++) {
        const x = Phaser.Math.Between(50, 1550);
        const y = Phaser.Math.Between(0, 500);
        coins.create(x, y, 'coin').setScale(0.5);
    }
    
    // Create bombs
    bombs = this.physics.add.group();
    
    // Create stars
    stars = this.physics.add.group({
        key: 'star',
        repeat: 11,
        setXY: { x: 12, y: 0, stepX: 70 }
    });
    
    stars.children.iterate((child) => {
        child.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
    });
    
    // Create particles
    particles = this.add.particles('star');
    emitter = particles.createEmitter({
        speed: 100,
        scale: { start: 0.5, end: 0 },
        blendMode: 'ADD'
    });
    
    // Load sounds
    collectSound = this.sound.add('collect');
    jumpSound = this.sound.add('jump');
    gameOverSound = this.sound.add('gameOver');
    
    // Set up collisions
    this.physics.add.collider(player, platforms);
    this.physics.add.collider(stars, platforms);
    this.physics.add.collider(bombs, platforms);
    this.physics.add.collider(player, bombs, hitBomb, null, this);
    
    // Collect star
    this.physics.add.overlap(player, stars, collectStar, null, this);
    
    // Collect coin
    this.physics.add.overlap(player, coins, collectCoin, null, this);
    
    // Camera follow
    this.cameras.main.setBounds(0, 0, 1600, 600);
    this.cameras.main.startFollow(player, true, 0.08, 0.08);
    this.cameras.main.setZoom(1.5);
    
    // Lighting
    this.lights.enable().setAmbientColor(0x555555);
    light = this.lights.addLight(0, 0, 200, 0xffffff, 1);
    
    // Controls
    cursors = this.input.keyboard.createCursorKeys();
    
    // Mobile detection
    isMobile = this.sys.game.device.input.touch;
    
    // Touch controls for mobile
    if (isMobile) {
        this.input.on('pointerdown', (pointer) => {
            if (pointer.y < 400) {
                // Jump if touching top half of screen
                if (player.body.touching.down) {
                    player.setVelocityY(-330);
                    jumpSound.play();
                }
            }
        });
        
        // Show mobile controls
        document.getElementById('controls').style.display = 'block';
    }
    
    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
        }, 500);
    }, 500);
    
    // Score text
    scoreText = document.getElementById('score');
    
    // Game over UI
    const gameOverText = document.getElementById('game-over');
    const restartBtn = document.getElementById('restart-btn');
    
    restartBtn.addEventListener('click', () => {
        gameOver = false;
        gameOverText.style.display = 'none';
        restartBtn.style.display = 'none';
        score = 0;
        updateScore(0);
        this.scene.restart();
    });
}

function update() {
    if (gameOver) return;
    
    // Update light position to follow player
    light.x = player.x;
    light.y = player.y;
    
    // Simple day/night cycle
    const time = this.time.now * 0.001;
    const brightness = 0.5 + Math.sin(time * 0.5) * 0.5;
    light.intensity = brightness;
    this.lights.setAmbientColor(Phaser.Display.Color.GetColor(
        100 + brightness * 100,
        100 + brightness * 100,
        150 + brightness * 100
    ));
    
    // Player movement
    if (cursors.left.isDown) {
        player.setVelocityX(-160);
        player.anims.play('left', true);
    } else if (cursors.right.isDown) {
        player.setVelocityX(160);
        player.anims.play('right', true);
    } else {
        player.setVelocityX(0);
        player.anims.play('turn');
    }
    
    // Jumping
    if ((cursors.up.isDown || cursors.space.isDown) && player.body.touching.down) {
        player.setVelocityY(-330);
        jumpSound.play();
    }
    
    // Spawn bombs
    if (Phaser.Math.RND.frac() < 0.005) {
        const x = player.x + Phaser.Math.Between(-400, 400);
        const bomb = bombs.create(x, 16, 'bomb');
        bomb.setBounce(1);
        bomb.setCollideWorldBounds(true);
        bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
    }
}

function collectCoin(player, coin) {
    coin.disableBody(true, true);
    collectSound.play();
    updateScore(10);
    
    // Emit particles
    emitter.setPosition(coin.x, coin.y);
    emitter.explode(10);
}

function collectStar(player, star) {
    star.disableBody(true, true);
    collectSound.play();
    updateScore(20);
    
    // Emit particles
    emitter.setPosition(star.x, star.y);
    emitter.explode(20);
    
    //  Add and update the score
    if (stars.countActive(true) === 0) {
        //  A new batch of stars to collect
        stars.children.iterate((child) => {
            child.enableBody(true, child.x, 0, true, true);
        });
    }
}

function hitBomb(player, bomb) {
    this.physics.pause();
    player.setTint(0xff0000);
    player.anims.play('turn');
    gameOver = true;
    gameOverSound.play();
    
    // Show game over screen
    const gameOverText = document.getElementById('game-over');
    const restartBtn = document.getElementById('restart-btn');
    gameOverText.style.display = 'block';
    restartBtn.style.display = 'block';
}

function updateScore(points) {
    score += points;
    scoreText.textContent = `Score: ${score}`;
}
