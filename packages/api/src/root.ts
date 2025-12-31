import { authRouter } from "./router/auth";
import { menuOcrRouter } from "./router/menu-ocr";
import { postRouter } from "./router/post";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  post: postRouter,
  menuOcr: menuOcrRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
