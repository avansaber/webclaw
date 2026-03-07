import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// Resolve the skills directory — works in dev (repo/) and prod (~/clawd/skills/)
function getSkillsDir(): string {
  if (process.env.SKILLS_DIR) return process.env.SKILLS_DIR;
  // Prod: ~/clawd/skills/ (check first — most specific)
  const homeDir = process.env.HOME || "/home/nobody";
  const prodDir = path.join(homeDir, "clawd", "skills");
  if (fs.existsSync(prodDir)) return prodDir;
  // Dev: cwd is web/, go up 2 levels (web/ → erpclaw-web/ → repo/)
  const repoDir = path.resolve(process.cwd(), "../..");
  if (fs.existsSync(repoDir)) return repoDir;
  return prodDir;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ skill: string }> }
) {
  const { skill } = await params;

  // Sanitize skill name
  if (!/^[a-z0-9-]+$/.test(skill)) {
    return NextResponse.json({ error: "Invalid skill name" }, { status: 400 });
  }

  const skillsDir = getSkillsDir();
  const yamlPath = path.join(skillsDir, skill, "UI.yaml");

  if (!fs.existsSync(yamlPath)) {
    return NextResponse.json({ error: "UI.yaml not found", skill }, { status: 404 });
  }

  try {
    const content = fs.readFileSync(yamlPath, "utf-8");
    const parsed = yaml.load(content);
    return NextResponse.json(parsed, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to parse UI.yaml", detail: String(e) },
      { status: 500 }
    );
  }
}
