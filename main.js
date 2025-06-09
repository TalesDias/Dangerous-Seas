const canvas = document.getElementById("canvas_id")
canvas.width = window.innerWidth
canvas.height = window.innerHeight

const ctx = canvas.getContext("2d")

// Dimensions constants
const N_SQ_W = 80
const N_SQ_H = 60
const SEP_W  = 0
const SEP_H  = -1 // There is a small bug somewhere, for now, leave this be
const SQ_W   = (canvas.width  - N_SQ_W*SEP_W)/N_SQ_W
const SQ_H   = (canvas.height - N_SQ_H*SEP_H)/N_SQ_H

// Origin and destiny constants
let   grid         = []
const BOAT         = {x:undefined, y:undefined}
const OBJECTIVE    = {x:undefined, y:undefined}
const MIN_DIST_OBJ = 30

// Whirlpools constants
const N_WP       = 25
let   whirlpools = []
const POWER_WP   = 60
const DECAY_WP   = 0.08 // should be smaller than 1
const AREA_WP    = 10

// Other heuristics constants
const FEAR_WP    = 40 
const STEP_COST  = 1

// Note: In order to the heuristics to be admissible, 
// in all cases we must have:
// FEAR_WP < POWER_WP, for values lower than AREA_WP
// If AREA_WP has a bigger value however (like 20, or 40),
// we will probably need FEAR_WP <<< POWER_WP  

// Data structures for the tiles
let openPQ     = null
let openSet    = null
let closedSet  = null
let resultPath = []

const genSeed  = MurmurHash3("lost2")
const rand_num = SimpleFastCounter32(genSeed(), genSeed()) 

// randomizes the search elements and 
// initializes some variables
function setup(){

    openPQ     = new Heap(Tile.compare)
    openSet    = new Set()
    closedSet  = new Set()


    for (let i = 0; i  < N_SQ_W; i++) {
        grid[i] = []
        for (let j = 0; j < N_SQ_H; j++) {
            grid[i][j] = new Tile(i, j)
        }
    }

    // this variable "occupies" some tiles so that
    // the whirlpools are not too close to the boat
    // or to the objective
    let occupiedTiles = new Set()

    ;[BOAT.x, BOAT.y] = randomPos()
    let sw = grid[BOAT.x][BOAT.y]
    addKNearestNeighbours(occupiedTiles, sw, 4)

    // The loop makes sure that the objective and the 
    // boat are not too close
    do{
        ;[OBJECTIVE.x, OBJECTIVE.y] = randomPos(occupiedTiles)
    } while (euclDist(BOAT, OBJECTIVE) < MIN_DIST_OBJ);
    let obj = grid[OBJECTIVE.x][OBJECTIVE.y]
    addKNearestNeighbours(occupiedTiles, obj, 4)

    grid[BOAT.x][BOAT.y].cost           = 0
    grid[OBJECTIVE.x][OBJECTIVE.y].cost = 0


    for (let i = 0; i < N_WP; i++) {
        let w = randomPos(occupiedTiles)
        w     = grid[w[0]][w[1]]
        addKNearestNeighbours(occupiedTiles, w, 0)  

        // You really don't want to go into a whirlpool
        w.cost = 999_999_999_999
        whirlpools[i] = w

        let neighs = new Set()
        neighs.add(w)

        // This defines the cost to drive close to a whirlpool
        for (let k = 0; k < AREA_WP; k++) {
            let new_neighs = new Set()

            for (const ne of neighs) {
                new_neighs = new_neighs.union(new Set(getNeighbours(ne)))
            }

            for (const nnew of new_neighs){
                if (!neighs.has(nnew)){
                    nnew.cost += POWER_WP*Math.exp(-DECAY_WP*Math.pow(k,2))
                    neighs.add(nnew)
                }
            }
            
        }
    }

    // Sets the boat as the starting point
    let initTile = grid[BOAT.x][BOAT.y]
    calcCosts(initTile, {cost:0})
    openPQ.add(initTile)
    openSet.add(initTile)
}


function draw(){
    let cursor = {x:0, y:0}

    cursor.x += SEP_W 
    for (let i = 0; i < N_SQ_W; i++) {

        cursor.y = SEP_H
        for (let j = 0; j < N_SQ_H; j++) {
            let g = grid[i][j]

            if(g.heuristic === null){
                let blue = 255 - (g.cost*255)/(POWER_WP)
                ctx.fillStyle = `rgb(30, 10, ${blue})`
            }
            else if(g.isOpen){
                ctx.fillStyle = 'rgb(0, 219, 29)'
            }
            else{
                ctx.fillStyle = 'rgb(124, 255, 142)'
            }

            ctx.beginPath()
            ctx.rect(cursor.x, cursor.y, SQ_W, SQ_H)
            ctx.fill()
            cursor.y += SQ_H + SEP_H
        }
        cursor.x += SQ_W + SEP_W
    }



    let start_x, start_y
    // a Red boat
    ctx.fillStyle = 'rgb(255, 60, 60)' 
    ctx.beginPath()
    start_x = (SQ_W + SEP_W) * BOAT.x + SEP_W
    start_y = (SQ_H + SEP_H) * BOAT.y + SEP_H
    ctx.rect(start_x, start_y, SQ_W, SQ_H)
    ctx.fill()

    // Objective colored like Sand
    ctx.fillStyle = 'rgb(241, 210, 29)' 
    ctx.beginPath()
    start_x = (SQ_W + SEP_W) * OBJECTIVE.x + SEP_W
    start_y = (SQ_H + SEP_H) * OBJECTIVE.y + SEP_H
    ctx.rect(start_x, start_y, SQ_W, SQ_H)
    ctx.fill()

    // The center of the whirlpools is grey for contrast
    for (const w of whirlpools) {   
        ctx.fillStyle = 'rgb(85, 85, 85)' 
        ctx.beginPath()
        start_x = (SQ_W + SEP_W) * w.x + SEP_W
        start_y = (SQ_H + SEP_H) * w.y + SEP_H
        ctx.rect(start_x, start_y, SQ_W, SQ_H)
        ctx.fill()
    }

    // The best path is a light red
    for (const r of resultPath){
        ctx.fillStyle = 'rgb(255, 173, 173)' 
        ctx.beginPath()
        start_x = (SQ_W + SEP_W) * r.x + SEP_W
        start_y = (SQ_H + SEP_H) * r.y + SEP_H
        ctx.rect(start_x, start_y, SQ_W, SQ_H)
        ctx.fill()
    }

}

$(this).keypress((e) => {
    if(e.keyCode === 110){ // 'n' key, or next
        if (resultPath.length === 0){
            AStarStep()
        }
    }
    else if (e.keyCode === 102){ // 'f' key, to run till the finish
        while (resultPath.length === 0){
            AStarStep()
        }
    }    
    else if (e.keyCode === 114){ // 'r' key, to reset
        resultPath = []
        grid       = []
        whirlpools = []
        setup()
        draw()
    }
})

function animate(){
    requestAnimationFrame(animate)

    // Limpa a tela
    ctx.beginPath()
    ctx.rect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgb(90, 90, 90)'
    ctx.fill()


    draw()
}

setup()
animate()

function AStarStep(){

    if(openPQ.size === 0){
        alert("There are no more open Tiles, the problem does not have a solution")
        console.log("There are no more open Tiles")
        return
    }

    let current = openPQ.remove()
    openSet.delete(current)
    

    if(current.x === OBJECTIVE.x && current.y === OBJECTIVE.y){
        console.log("Objective reached")
        console.log(`Cost: ${current.antecessor.cost}`)
        console.log(`Final tile value: ${current.antecessor.value}`)
        calculateFinalPath()
        return
    }

    let neighs = getNeighbours(current)

    for (const ne of neighs) {
        if(openSet.has(ne) || closedSet.has(ne)){
            continue
        }

        calcCosts(ne, current)    
        ne.antecessor = current
        openPQ.add(ne)
        openSet.add(ne)
    }

    closedSet.add(current)
    current.isOpen = false

    /*
    // For debbuging only
    // Take care, openPQ can get quite large
    console.log(closedSet)
    for(const o of openPQ.array){ 
        console.log(o)
    }
    */
}

function calculateFinalPath(){
    let current = grid[OBJECTIVE.x][OBJECTIVE.y]

    while(!current.antecessor.equals(grid[BOAT.x][BOAT.y])){
        current = current.antecessor
        resultPath.push(current)
    } 
}

function calcCosts(tile, originTile){
    
    // This is the cost to get to originTile plus
    // a STEP_COST to move from originTile to tile.
    // The extra costs due to whirlpools were previously
    // calculated and stored in this.cost
    tile.cost = tile.cost + (originTile.cost + STEP_COST)

    let dist = Math.pow(euclDist(tile, OBJECTIVE), 3)
    let fear = 0
    for (const w of whirlpools){
        fear += FEAR_WP/(Math.pow(euclDist(tile, w), 4) + 1)
    }

    tile.heuristic = dist + fear 
}

function euclDist(t1, t2){
    return Math.sqrt(Math.pow(t1.x - t2.x, 2) + Math.pow(t2.y - t1.y, 2))
}

function getNeighbours(tile){
    let neighs     = []

    for(xd of [-1,0,1]){
        for(yd of [-1,0,1]){
            let new_x = tile.x + xd
            let new_y = tile.y + yd
            if(isPosValid(new_x, new_y) && !(xd===yd && xd===0)){
                neighs.push(grid[new_x][new_y])
            }
        }
    }

    return neighs
}

function isPosValid(x, y){    
    if(    x >= 0 
        && x <= N_SQ_W - 1
        && y >= 0
        && y <= N_SQ_H - 1) {
            return true
    }
    return false
}


// Having to recieve the Set here really breaks my heart
// it's C behavior in a High level language
// And I know Java does the same thing, but in java 
// correctly copying an object doesn't rely on advanced magic
function addKNearestNeighbours(neighs, tile, k_neighs){
    neighs.add(tile)
    for (let k = 0; k < k_neighs; k++) {
        let new_neighs = []

        for (const ne of neighs) {
            new_neighs = new_neighs.concat(getNeighbours(ne))
        }

        for (const nnew of new_neighs) neighs.add(nnew)   
    }

}

function randomPos(OccupiedTilesSet = null){
    let rand_x, rand_y, t 

    if(OccupiedTilesSet === null){
        
        rand_x = Math.ceil(rand_num() * (N_SQ_W - 1))
        rand_y = Math.ceil(rand_num() * (N_SQ_H - 1))

        return [rand_x, rand_y]
    }

    do{
        rand_x = Math.ceil(rand_num() * (N_SQ_W - 1))
        rand_y = Math.ceil(rand_num() * (N_SQ_H - 1))

        t = grid[rand_x][rand_y]

    } while(OccupiedTilesSet.has(t)) 

    return [rand_x, rand_y]
}