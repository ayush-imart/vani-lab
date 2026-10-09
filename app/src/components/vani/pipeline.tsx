import { useState } from "react";
import { motion } from "motion/react";
import { Mascot } from "page-mascot";
import { AudioLines, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTitle, Pill } from "./common";
import { CallWindow } from "./call-window";
import { versions } from "./data";
import type { VersionId } from "./performance-data";

export function Pipeline() {
  const [calling, setCalling] = useState<VersionId | null>(null);

  return (
    <>
      <PageTitle
        eyebrow="EXPERIMENT / LIVE PIPELINE"
        title="Pick a voice. Talk to it."
        description="Open a version to try a call, then send it for audit."
      />
      <div className="section-heading">
        <div className="section-kicker">
          <h2>Your voices</h2>
          <Pill>Synthetic data</Pill>
        </div>
        <span className="sarvam">
          Powered by <AudioLines size={15} />
          <strong>sarvam</strong>
        </span>
      </div>
      <div className="version-cards">
        {versions.map((v) => (
          <motion.article
            whileHover={{ y: -2 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            key={v.id}
            className={`version-card version-${v.id}`}
            data-testid={`version-card-${v.id}`}
          >
            <div className="mascot-stage">
              <div className="card-top">
                <span className="version-letter">{v.id}</span>
                <span className="card-live">
                  <i className="live-dot" />
                  Live
                </span>
              </div>
              <div onClick={() => setCalling(v.id as VersionId)}>
                <Mascot
                  directions={v.directions}
                  reactions={v.reactions}
                  size={142}
                  label={`Open a call with Version ${v.id}`}
                />
              </div>
            </div>
            <div className="version-info">
              <div className="version-name">
                <span>Version {v.id}</span>
                <span>{v.name}</span>
                {v.id === "A" && <Pill>Baseline</Pill>}
              </div>
              <p className="version-description">{v.title}</p>
              <Button className="mt-3 w-full" onClick={() => setCalling(v.id as VersionId)}>
                <Phone />
                Start a call
              </Button>
            </div>
          </motion.article>
        ))}
      </div>
      <CallWindow version={calling} onClose={() => setCalling(null)} />
    </>
  );
}
