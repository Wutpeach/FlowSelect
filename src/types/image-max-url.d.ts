declare module "image-max-url" {
  export type MaxUrlProblemFlags = {
    watermark?: boolean;
    smaller?: boolean;
    possibly_different?: boolean;
    possibly_broken?: boolean;
    possibly_upscaled?: boolean;
    bruteforce?: boolean;
  };

  export type MaxUrlCandidate = {
    url: string | null;
    video?: boolean;
    always_ok?: boolean;
    likely_broken?: boolean;
    is_original?: boolean;
    bad?: boolean | "mask";
    fake?: boolean;
    headers?: Record<string, string | null | undefined>;
    problems?: MaxUrlProblemFlags;
  };

  export type MaxUrlCallback = (result: MaxUrlCandidate[] | null | undefined) => void;

  export type MaxUrlOptions = {
    fill_object?: boolean;
    iterations?: number;
    use_cache?: boolean | "read";
    urlcache_time?: number;
    exclude_videos?: boolean;
    include_pastobjs?: boolean;
    force_page?: boolean;
    allow_thirdparty?: boolean;
    filter?: (url: string) => boolean;
    do_request?: (options: unknown) => void;
    cb?: MaxUrlCallback;
  };

  export type MaxUrlFn = ((url: string, options: MaxUrlOptions) => void) & {
    default_options?: {
      exclude_problems?: string[];
    };
    check_bad_if?: (badIf: unknown, response: unknown) => boolean;
  };

  const maxUrl: MaxUrlFn;
  export default maxUrl;
}
