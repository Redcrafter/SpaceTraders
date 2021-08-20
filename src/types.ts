export interface Cargo {
    good: string;
    quantity: number;
    totalVolume: number;
}

export interface ShipData {
    type: string;
    class: string;
    manufacturer: string;

    maxCargo: number;
    loadingSpeed: number;

    speed: number;
    plating: number;
    weapons: number;
}

export interface UserShip extends ShipData {
    id: string;

    location?: string;
    flightPlanId?: string;

    x: number;
    y: number;

    cargo: Cargo[];
    spaceAvailable: number;
}

export interface Loan {
    id: string,
    due: string,
    repaymentAmount: number,
    status: string,
    type: string
}

export interface UserData {
    username: string;
    credits: number;
    joinedAt: string;
    shipCount: number;
    structureCount: number;
}

export interface MarketShip {
    shipId: string;
    username: string;
    shipType: string;
}

export interface MarketItem {
    symbol: string;
    volumePerUnit: number;
    pricePerUnit: number;
    spread: number;
    purchasePricePerUnit: number;
    sellPricePerUnit: number;
    quantityAvailable: number;
}

export interface Location {
    symbol: string;
    type: string;
    name: string;

    x: number;
    y: number;

    allowsConstruction: boolean;
    traits: string[];

    messages?: string[];
}
export interface MarketLocation extends Location {
    marketplace: MarketItem[];
}

export interface System {
    symbol: string;
    name: string;
}

export interface FlightPlan {
    id: string;
    shipId: string;
    createdAt: string;
    arrivesAt: string;
    destination: string;
    departure: string;
    distance: number;
    fuelConsumed: number;
    fuelRemaining: number;
    terminatedAt: null;
    timeRemainingInSeconds: number;
}

export interface LeaderboardEntry {
    username: string;
    netWorth: number;
    rank: number;
}

export interface Leaderboard {
    netWorth: LeaderboardEntry[];
    userNetWorth: [LeaderboardEntry];
}

export interface FlightData {
    from: Location;
    to: Location;
    plan: FlightPlan;
    ship: UserShip;
    gain: number;
}

export interface InfoMessage {
    type: "info";
    data: {
        credits: number;
        ships: UserShip[]
    };
}
export interface FlightMessage {
    type: "flight";
    data: FlightData;
}

export type LogLevel = "trace" | "info" | "warning" | "error";
export interface LogData {
    level: LogLevel;
    message: string;
}
export interface LogMessage {
    type: "log";
    data: LogData;
}
export interface MarketMessage {
    type: "market";
    data: MarketLocation[];
}

export interface LeaderboardMessage {
    type: "leaderboard",
    data: {
        time: number,
        data: LeaderboardEntry[]
    }
}

export type Message = FlightMessage | InfoMessage | LogMessage | MarketMessage | LeaderboardMessage;
