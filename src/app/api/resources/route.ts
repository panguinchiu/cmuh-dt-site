import { z } from "zod";
import { db } from "@/lib/db";
import {
  assert,
  canSetResourceVisibility,
  isInstructor,
  requireUser,
} from "@/lib/authz";
import { HttpError, json, route } from "@/lib/http";
import { userFromRequest } from "@/lib/session";
import {
  listVisibleResources,
  publicResource,
  resourceInclude,
} from "@/lib/resources";
import { linkUrl, normalizeMeta, resourceMeta } from "@/lib/resource-input";
import { storeFile, storeGame } from "@/lib/uploads";
import { deletePrefix } from "@/lib/blob";
import { audit } from "@/lib/audit";

/** 列表：學員只拿到看得到的資源（伺服器端過濾） */
export const GET = route(async (req: Request) => {
  const me = requireUser(await userFromRequest(req));
  const rows = await listVisibleResources(me);
  return json({
    resources: rows.map((r) => publicResource(r, isInstructor(me), me.id)),
  });
});

const linkBody = resourceMeta.extend({ type: z.literal("link"), url: linkUrl });

/** 新增（講師與學員皆可；學員的可見範圍受 canSetResourceVisibility 限制）：link 用 JSON；file / html_game 用 multipart（meta JSON + file） */
export const POST = route(async (req: Request) => {
  const me = requireUser(await userFromRequest(req));
  const ct = req.headers.get("content-type") ?? "";
  let data: Parameters<typeof db.resource.create>[0]["data"];
  let meta;
  let uploadedPrefix: string | null = null;

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const type = z.enum(["file", "html_game"]).parse(form.get("type"));
    meta = await normalizeMeta(
      resourceMeta.parse(JSON.parse(String(form.get("meta") ?? "{}"))),
    );
    assert(canSetResourceVisibility(me, meta));
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "請選擇檔案");
    const stored =
      type === "file" ? await storeFile(file) : await storeGame(file);
    uploadedPrefix = stored.blobKey;
    data = {
      type,
      ...stored,
      title: meta.title,
      description: meta.description,
      visibility: meta.visibility,
      agendaItemId: meta.agendaItemId,
      sortOrder: meta.sortOrder,
      createdById: me.id,
    };
  } else {
    const body = linkBody.parse(await req.json());
    meta = await normalizeMeta(body);
    assert(canSetResourceVisibility(me, meta));
    data = {
      type: "link",
      url: body.url,
      title: meta.title,
      description: meta.description,
      visibility: meta.visibility,
      agendaItemId: meta.agendaItemId,
      sortOrder: meta.sortOrder,
      createdById: me.id,
    };
  }

  try {
    const r = await db.resource.create({
      data: {
        ...data,
        groups: { create: meta.groupIds.map((groupId) => ({ groupId })) },
        users: { create: meta.userIds.map((userId) => ({ userId })) },
      },
      include: resourceInclude,
    });
    await audit(me.id, "resource.create", r.id, {
      title: r.title,
      type: r.type,
      visibility: r.visibility,
    });
    return json(publicResource(r, isInstructor(me), me.id), 201);
  } catch (e) {
    if (uploadedPrefix) await deletePrefix(uploadedPrefix).catch(() => {});
    throw e;
  }
});
