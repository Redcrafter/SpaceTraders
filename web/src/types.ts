export interface Cargo {
    good: string;
    quantity: number;
    totalVolume: number;
}

export interface UserShip {
    id: string;
    location: string;
    x: number;
    y: number;
    cargo: Cargo[];
    spaceAvailable: number;
    type: string;
    class: string;
    maxCargo: number;
    speed: number;
    manufacturer: string;
    plating: number;
    weapons: number;
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
    ships: UserShip[];
    loans: Loan[];
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
    structures: any[];

    ships?: MarketShip[];
    marketplace?: MarketItem[];
}

export interface System {
    symbol: string;
    name: string;
    locations: Location[];
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

export interface MarketOrder {
    credits: number;
    order: {
        good: string;
        quantity: number;
        pricePerUnit: number;
        total: number;
    }
    ship: UserShip;
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
    data: UserData;
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
    data: Location[];
}

export type Message = FlightMessage | InfoMessage | LogMessage | MarketMessage;
