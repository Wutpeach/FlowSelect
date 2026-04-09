import {
  unwrapRedirectTargetUrl,
  type RawDownloadInput,
  type VideoDownloadIntent,
} from "../core/index.js";

const GALLERY_DL_SUPPORTED_EXAMPLE_HOSTS = `
2ch.org
35photo.pro
4archive.org
4chanarchives.com
500px.com
8chan.moe
8kun.top
94chan.org
acidimg.cc
agn.ph
ahottie.top
allgirl.booru.org
allporncomic.com
app.koofr.net
arca.live
architizer.com
archived.moe
archiveofourown.org
are.na
aryion.com
audiochan.com
behoimi.org
bit.ly
blog.blogspot.com
blog.hatenablog.com
blog.livedoor.jp
blog.lofter.com
blog.naver.com
boards.4channel.org
booru.bcbnsfw.space
boosty.to
booth.pm
bsky.app
bunkr.si
catbox.moe
cfake.com
chzzk.naver.com
ci-en.net
civitai.com
comic.keenspot.com
comic.naver.com
comick.io
comics.8muses.com
comicvine.gamespot.com
cyberdrop.cr
cyberfile.me
danbooru.donmai.us
dandadan.net
danke.moe
dec.2chan.net
derpibooru.org
desktopography.net
discord.com
downloads.khinsider.com
dynasty-scans.com
e621.cc
e621.net
en.wikipedia.org
endchan.org
everia.club
fanbox.cc
fanfox.net
fansly.com
fantia.jp
fapachi.com
fapello.com
fappic.com
fikfap.com
files.catbox.moe
filester.me
fitnakedgirls.com
flickr.com
foriio.com
furry34.com
fuskator.com
gelbooru.com
girlsreleased.com
gofile.io
hentai-cosplay-xxx.com
hentai2read.com
hentaihere.com
hiperdex.com
hotleak.vip
i.redd.it
ibb.co
imageshack.com
imagetwist.com
imgadult.com
imgbox.com
imgchest.com
imgclick.net
imgdrive.net
imglike.com
imgpile.com
imgspice.com
imgth.com
imgur.com
imhentai.xxx
imx.to
inkbunny.net
issuu.com
itaku.ee
joyreactor.com
jpg7.cr
kabe-uchiroom.com
kaliscan.me
kemono.cr
komikcast.li
leakgallery.com
lensdump.com
lexica.art
lightroom.adobe.com
luscious.net
manga.madokami.al
mangadex.org
mangafire.to
mangapark.net
mangareader.to
mangataro.org
mastodon.social
misskey.io
mixdrop.ag
motherless.com
myhentaigallery.com
nekohouse.su
news.sankakucomplex.com
nijie.info
nitter.net
nozomi.la
nsfwalbum.com
nudostar.tv
ok.porn
pbs.twimg.com
pholder.com
picarto.tv
picazor.com
picstate.com
piczel.tv
pin.it
pixeldrain.com
pixhost.to
pixiv.me
poipiku.com
pornstars.tube
postimg.cc
raddle.me
raw.senmanga.com
rawkuma.net
reactor.cc
read.powermanga.org
readcomiconline.li
realbooru.com
redgifs.com
rule34.paheal.net
rule34.us
rule34.xyz
rule34vault.com
s3nd.pics
safebooru.org
sankaku.app
scatbooru.co.uk
scrolller.com
seiga.nicovideo.jp
shop.booth.pm
silverpic.net
simpcity.cr
sizebooru.com
skeb.jp
sketch.pixiv.net
soundgasm.net
space.bilibili.com
speakerdeck.com
sturdychan.help
sxypix.com
tapas.io
tcbscans.me
telegra.ph
tenor.com
thefap.net
thehentaiworld.com
tmohentai.com
toyhou.se
tumblrgallery.xyz
tungsten.run
turbo.cr
twibooru.org
unsplash.com
uploadir.com
urlgalleries.com
user.fanbox.cc
user.imgbb.com
user.itch.io
user.myportfolio.com
user.newgrounds.com
user.pixnet.net
user.slickpic.com
user.smugmug.com
vanilla-rock.com
vidya.pics
vipergirls.to
vipr.im
vk.com
vm.tiktok.com
vsco.co
wallhaven.cc
wallpapercave.com
warosu.org
webmshare.com
weebcentral.com
weebdex.org
weibo.com
whyp.it
ww2.mangafreak.me
www.adultempire.com
www.artstation.com
www.bbc.co.uk
www.behance.net
www.bellazon.com
www.bilibili.com
www.comedywildlifephoto.com
www.deviantart.com
www.eporner.com
www.erome.com
www.facebook.com
www.fashionnova.com
www.flickr.com
www.foriio.com
www.furaffinity.net
www.girlswithmuscle.com
www.idolcomplex.com
www.imagebam.com
www.imagefap.com
www.imagepond.net
www.imagevenue.com
www.imgpv.com
www.instagram.com
www.iwara.tv
www.listal.com
www.mangahere.cc
www.mangakakalot.gg
www.mangaread.org
www.mangatown.com
www.mangoxo.com
www.newgrounds.com
www.patreon.com
www.pexels.com
www.pholder.com
www.pictoa.com
www.pillowfort.social
www.pinterest.com
www.pixiv.net
www.pixivision.net
www.plurk.com
www.poringa.net
www.pornhub.com
www.pornpics.com
www.reddit.com
www.redgifs.com
www.sex.com
www.simply-hentai.com
www.slideshare.net
www.steamgriddb.com
www.subscribestar.com
www.tiktok.com
www.toyhou.se
www.tumblr.com
www.turboimagehost.com
www.vogue.com
www.weasyl.com
www.webtoons.com
www.wikiart.org
www.wikifeet.com
www.xasiat.com
www.xvideos.com
www.zerochan.net
x.com
xbunkr.com
xfolio.jp
xhamster.com
yande.re
yiffverse.com
yourlesbians.com
`;

const MANUAL_GALLERY_DL_HOST_ALIASES = [
  "m.weibo.cn",
  "m.weibo.com",
  "video.weibo.com",
  "weibo.cn",
];

const WEIBO_HOSTS = new Set(
  [
    "weibo.com",
    "weibo.cn",
    "m.weibo.cn",
    "m.weibo.com",
    "video.weibo.com",
  ].map((host) => host.toLowerCase()),
);

const normalizeComparableHost = (host: string): string => host.trim().toLowerCase().replace(/^www\./, "");

const GALLERY_DL_SUPPORTED_HOSTS = new Set(
  [
    ...GALLERY_DL_SUPPORTED_EXAMPLE_HOSTS.trim().split(/\r?\n/),
    ...MANUAL_GALLERY_DL_HOST_ALIASES,
  ]
    .map((host) => normalizeComparableHost(host))
    .filter(Boolean),
);

const parseUrl = (value: string | undefined): URL | null => {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
};

const normalizeWeiboStatusId = (value: string | null | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || !/^[A-Za-z0-9]+$/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
};

const extractWeiboStatusIdFromPath = (pathname: string): string | undefined => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return undefined;
  }

  if ((segments[0] === "detail" || segments[0] === "status") && segments[1]) {
    return normalizeWeiboStatusId(segments[1]);
  }

  if (/^\d+$/.test(segments[0]) && segments[1]) {
    return normalizeWeiboStatusId(segments[1]);
  }

  return undefined;
};

const readWeiboStatusIdFromParams = (parsed: URL): string | undefined => {
  for (const key of ["layerid", "mid", "id"]) {
    const resolved = normalizeWeiboStatusId(parsed.searchParams.get(key));
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
};

export const resolveComparableUrlHost = (value: string | undefined): string | undefined => {
  const parsed = parseUrl(value);
  if (!parsed) {
    return undefined;
  }
  return normalizeComparableHost(parsed.hostname);
};

export const isWeiboUrl = (value: string | undefined): boolean => {
  const host = resolveComparableUrlHost(value);
  return host ? WEIBO_HOSTS.has(host) : false;
};

export const resolveWeiboSourceUrl = (value: string | undefined): string | undefined => {
  const unwrappedUrl = unwrapRedirectTargetUrl(value);
  if (isWeiboUrl(unwrappedUrl)) {
    return unwrappedUrl;
  }
  return isWeiboUrl(value) ? value?.trim() : undefined;
};

export const isWeiboTvShowUrl = (value: string | undefined): boolean => {
  const sourceUrl = resolveWeiboSourceUrl(value);
  const parsed = parseUrl(sourceUrl);
  if (!parsed) {
    return false;
  }
  return /^\/tv\/show\/[^/]+$/i.test(parsed.pathname);
};

export const isGalleryDlSupportedUrl = (value: string | undefined): boolean => {
  const host = resolveComparableUrlHost(value);
  return host ? GALLERY_DL_SUPPORTED_HOSTS.has(host) : false;
};

export const resolveGalleryDlSiteId = (
  primaryUrl: string | undefined,
  siteHint?: string,
): string => {
  const normalizedSiteHint = typeof siteHint === "string" ? siteHint.trim() : "";
  if (normalizedSiteHint) {
    return normalizedSiteHint;
  }

  const host = resolveComparableUrlHost(primaryUrl);
  if (!host) {
    return "gallery-dl";
  }
  if (WEIBO_HOSTS.has(host)) {
    return "weibo";
  }
  return host;
};

export const resolveWeiboGalleryDlSourceUrl = (value: string | undefined): string | undefined => {
  const sourceUrl = resolveWeiboSourceUrl(value);
  const parsed = parseUrl(sourceUrl);
  if (!parsed || !sourceUrl || !isWeiboUrl(sourceUrl)) {
    return undefined;
  }

  const statusId = readWeiboStatusIdFromParams(parsed) ?? extractWeiboStatusIdFromPath(parsed.pathname);
  if (!statusId) {
    return sourceUrl.trim();
  }

  return `https://weibo.com/detail/${statusId}`;
};

export const buildGalleryDlVideoIntent = (
  input: RawDownloadInput,
  siteId: string,
): VideoDownloadIntent => ({
  type: "video",
  siteId,
  originalUrl: input.url,
  pageUrl: input.pageUrl,
  title: input.title,
  cookies: input.cookies,
  referer: input.pageUrl,
  priority: 72,
  candidates: input.videoCandidates ?? [],
  selectionScope: input.selectionScope,
  ytdlpQuality: input.ytdlpQuality,
  preferredFormat: "best",
  clipStartSec: input.clipStartSec,
  clipEndSec: input.clipEndSec,
});
