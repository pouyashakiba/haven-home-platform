export type DeviceKind =
  | "light"
  | "climate"
  | "lock"
  | "camera"
  | "motion"
  | "sensor"
  | "shade"
  | "media"
  | "switch"
  | "keypad"
  | "fan";

export type HomeDevice = {
  id: string;
  entityId: string;
  name: string;
  room: string;
  kind: DeviceKind;
  state: string;
  detail: string;
  active: boolean;
  available: boolean;
  deviceId?: string;
  areaId?: string;
  integration?: string;
  manufacturer?: string;
  model?: string;
};

export const demoDevices: HomeDevice[] = [
  {
    id: "living-light",
    entityId: "light.living_room",
    name: "Living room",
    room: "Living room",
    kind: "light",
    state: "On",
    detail: "72% · warm",
    active: true,
    available: true,
  },
  {
    id: "kitchen-light",
    entityId: "light.kitchen_pendants",
    name: "Kitchen pendants",
    room: "Kitchen",
    kind: "light",
    state: "On",
    detail: "58% · warm",
    active: true,
    available: true,
  },
  {
    id: "thermostat",
    entityId: "climate.main_floor",
    name: "Main climate",
    room: "Hallway",
    kind: "climate",
    state: "72°",
    detail: "Heating to 72°",
    active: true,
    available: true,
  },
  {
    id: "front-door",
    entityId: "binary_sensor.front_door",
    name: "Front door",
    room: "Entry",
    kind: "lock",
    state: "Locked",
    detail: "Closed · 2 min ago",
    active: false,
    available: true,
  },
  {
    id: "entry-camera",
    entityId: "camera.entry",
    name: "Entry camera",
    room: "Entry",
    kind: "camera",
    state: "Live",
    detail: "Clear · recording",
    active: true,
    available: true,
  },
  {
    id: "entry-motion",
    entityId: "binary_sensor.entry_motion",
    name: "Entry motion",
    room: "Entry",
    kind: "motion",
    state: "Clear",
    detail: "No recent movement",
    active: false,
    available: true,
  },
  {
    id: "office-light",
    entityId: "light.office_desk",
    name: "Desk light",
    room: "Office",
    kind: "light",
    state: "Off",
    detail: "Last on 6:18 PM",
    active: false,
    available: true,
  },
  {
    id: "bedroom-shade",
    entityId: "cover.primary_bedroom",
    name: "Bedroom shade",
    room: "Bedroom",
    kind: "shade",
    state: "Closed",
    detail: "0% open",
    active: false,
    available: true,
  },
  {
    id: "air-sensor",
    entityId: "sensor.living_air_quality",
    name: "Air quality",
    room: "Living room",
    kind: "sensor",
    state: "Excellent",
    detail: "CO₂ 512 ppm",
    active: false,
    available: true,
  },
];

export const roomSummary = [
  { name: "Living room", value: "72°", active: 2 },
  { name: "Kitchen", value: "71°", active: 1 },
  { name: "Entry", value: "Secure", active: 1 },
  { name: "Office", value: "70°", active: 0 },
  { name: "Bedroom", value: "69°", active: 0 },
];
