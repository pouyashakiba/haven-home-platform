import type { Metadata } from "next";
import { HomeDashboard } from "./components/HomeDashboard";

export const metadata: Metadata = {
  title: "Haven — Your home, beautifully in sync",
  description:
    "A calm, spatial home interface powered by Home Assistant.",
};

export default function Home() {
  return <HomeDashboard />;
}
