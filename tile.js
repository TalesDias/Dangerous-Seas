class Tile {

    #heuristic = null
    #cost      = 0 

    constructor(x, y) {
        this.x = x
        this.y = y
        this.isOpen  = true
        this.antecessor = null
    }

    get value(){
        return this.#cost + this.#heuristic
    }

    set heuristic(newHeuristic){
        this.#heuristic = newHeuristic
    }

    get heuristic() {
        return this.#heuristic
    }

    set cost(newCost){
        this.#cost = newCost
    }

    get cost() {
        return this.#cost
    }

    equals(tile){
        return this.x == tile.x && this.y == tile.y
    }

    static compare(a, b){
        return a.value > b.value
    }
}