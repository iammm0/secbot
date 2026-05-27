export interface SkillFrontmatter {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  triggers: string[];
  prerequisites: string[];
}

export interface SkillRecord extends SkillFrontmatter {
  slug: string;
  scope: string;
  relativeDir: string;
  body: string;
}
