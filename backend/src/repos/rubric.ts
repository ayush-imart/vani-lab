import type { Rubric } from "../contract";
import type { CollectionFactory } from "./collection";

type RubricDoc = Rubric & { id: string };
const ACTIVE_ID = "active";

export interface RubricRepo {
  getActive(): Promise<Rubric | undefined>;
  saveActive(rubric: Rubric): Promise<Rubric>;
}

export function createRubricRepo(make: CollectionFactory): RubricRepo {
  const rows = make<RubricDoc>("rubrics");
  return {
    getActive: () => rows.get(ACTIVE_ID),
    saveActive: async (rubric) => {
      await rows.put({ ...rubric, id: ACTIVE_ID });
      return rubric;
    },
  };
}
