@"
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
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// Initialize the game
const game = new Phaser.Game(config);

// Game variables
let player;
let cursors;
let lastUpdate = 0;
const PLAYER_SPEED = 150;

function preload() {
    // Load player sprite from Kenney's assets
    this.load.spritesheet('player', 'https://kenney.nl/assets/character_spritesheet.png', {
        frameWidth: 32,
        frameHeight: 32
    });
    
    // Load tileset from Kenney's assets
    this.load.image('tiles', 'https://kenney.nl/assets/terrain.png');
    
    // Create a simple map programmatically
    this.cache.tilemap.entries.set('map', {
        format: Phaser.Tilemaps.Formats.ARRAY_2D,
        data: createSimpleMap(this)
    });
    
    // Update loading progress
    this.load.on('progress', (value) => {
        document.querySelector('.loading-bar-fill').style.width = `${value * 100}%`;
    });
}

function createSimpleMap() {
    // Create a 40x30 grid map
    const map = [];
    const size = { width: 40, height: 30 };
    
    // Fill with grass (tile 3 in the tileset)
    for (let y = 0; y < size.height; y++) {
        const row = [];
        for (let x = 0; x < size.width; x++) {
            // Create a border of water (tile 0) and fill the rest with grass (tile 3)
            if (x === 0 || y === 0 || x === size.width - 1 || y === size.height - 1) {
                row.push(0); // Water
            } else if (x % 10 === 0 && y % 10 === 0) {
                row.push(2); // Tree
            } else if (x % 8 === 0 && y % 8 === 0) {
                row.push(1); // Flower
            } else {
                row.push(3); // Grass
            }
        }
        map.push(row);
    }
    
    // Add some paths
    for (let x = 5; x < 35; x++) {
        map[15][x] = 4; // Dirt path
    }
    for (let y = 5; y < 25; y++) {
        map[y][20] = 4; // Dirt path
    }
    
    return map;
}

function create() {
    // Create a blank tilemap
    const map = this.make.tilemap({
        tileWidth: 32,
        tileHeight: 32,
        width: 40,
        height: 30
    });
    
    // Add the tileset image
    const tileset = map.addTilesetImage('tiles');
    
    // Create layers
    const groundLayer = map.createBlankLayer('Ground', tileset);
    
    // Fill the layer with our map data
    const mapData = this.cache.tilemap.get('map').data;
    groundLayer.weightedRandomize([
        { index: 0, weight: 1 },  // Water
        { index: 1, weight: 5 },  // Flower
        { index: 2, weight: 2 },  // Tree
        { index: 3, weight: 20 }, // Grass
        { index: 4, weight: 10 }  // Dirt path
    ], 0, 0, 40, 30);
    
    // Set up collision for water and trees
    groundLayer.setCollision([0, 2]);
    
    // Create player
    player = this.physics.add.sprite(400, 300, 'player');
    player.setCollideWorldBounds(true);
    
    // Set up player animations
    this.anims.create({
        key: 'walk-down',
        frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1
    });
    
    this.anims.create({
        key: 'walk-up',
        frames: this.anims.generateFrameNumbers('player', { start: 4, end: 7 }),
        frameRate: 10,
        repeat: -1
    });
    
    this.anims.create({
        key: 'walk-left',
        frames: this.anims.generateFrameNumbers('player', { start: 8, end: 11 }),
        frameRate: 10,
        repeat: -1
    });
    
    this.anims.create({
        key: 'walk-right',
        frames: this.anims.generateFrameNumbers('player', { start: 12, end: 15 }),
        frameRate: 10,
        repeat: -1
    });
    
    // Set up camera
    this.cameras.main.setBounds(0, 0, 40 * 32, 30 * 32);
    this.cameras.main.startFollow(player, true, 0.1, 0.1);
    
    // Set up physics
    this.physics.add.collider(player, groundLayer);
    
    // Set up controls
    cursors = this.input.keyboard.createCursorKeys();
    
    // Add interaction
    this.input.keyboard.on('keydown-SPACE', () => {
        // Check for interactable objects
        const tileX = Math.floor(player.x / 32);
        const tileY = Math.floor(player.y / 32);
        const tile = groundLayer.getTileAt(tileX, tileY);
        
        if (tile && tile.index === 1) { // Flower
            // Pick the flower
            groundLayer.removeTileAt(tileX, tileY);
            // TODO: Add to inventory
            console.log('Picked a flower!');
        }
    });
    
    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
        }, 500);
    }, 500);
}

function update() {
    // Reset velocity
    player.setVelocity(0);
    
    // Handle movement
    if (cursors.left.isDown) {
        player.setVelocityX(-PLAYER_SPEED);
        player.anims.play('walk-left', true);
        player.lastDirection = 'left';
    } else if (cursors.right.isDown) {
        player.setVelocityX(PLAYER_SPEED);
        player.anims.play('walk-right', true);
        player.lastDirection = 'right';
    }
    
    if (cursors.up.isDown) {
        player.setVelocityY(-PLAYER_SPEED);
        player.anims.play('walk-up', true);
        player.lastDirection = 'up';
    } else if (cursors.down.isDown) {
        player.setVelocityY(PLAYER_SPEED);
        player.anims.play('walk-down', true);
        player.lastDirection = 'down';
    }
    
    // Stop animation if no movement
    if (cursors.up.isUp && cursors.down.isUp && cursors.left.isUp && cursors.right.isUp) {
        player.anims.stop();
        // Set idle frame based on last direction
        if (player.lastDirection) {
            player.setFrame(player.anims.get('walk-' + player.lastDirection).frames[0].frame.index);
        }
    }
}
"@ | Out-File -FilePath "C:\cozy-game\js\game.js" -Encoding utf8
