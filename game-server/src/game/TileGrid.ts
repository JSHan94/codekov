export enum TerrainType {
  FLOOR = 0,
  WALL = 1,
  COVER = 2,
  BUSH = 3,
}

export class TileGrid {
  readonly width: number;
  readonly height: number;
  private data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
  }

  get(x: number, y: number): TerrainType {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return TerrainType.WALL; // Out of bounds treated as wall
    }
    return this.data[y * this.width + x] as TerrainType;
  }

  set(x: number, y: number, t: TerrainType): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.data[y * this.width + x] = t;
  }

  isPassable(x: number, y: number): boolean {
    return this.get(x, y) !== TerrainType.WALL;
  }

  isCover(x: number, y: number): boolean {
    return this.get(x, y) === TerrainType.COVER;
  }

  isBush(x: number, y: number): boolean {
    return this.get(x, y) === TerrainType.BUSH;
  }

  /** Serialize to a 2500-char string (1 digit per tile) for client sync */
  serialize(): string {
    let s = "";
    for (let i = 0; i < this.data.length; i++) {
      s += this.data[i].toString();
    }
    return s;
  }

  /** Get all wall coordinates as "x,y" strings */
  getWallCoords(): Set<string> {
    const coords = new Set<string>();
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) === TerrainType.WALL) {
          coords.add(`${x},${y}`);
        }
      }
    }
    return coords;
  }
}
