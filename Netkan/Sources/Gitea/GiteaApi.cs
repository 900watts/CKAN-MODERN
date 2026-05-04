using System;

using Newtonsoft.Json;

using CKAN.NetKAN.Services;

namespace CKAN.NetKAN.Sources.Gitea
{
    internal sealed class GiteaApi : IGiteaApi
    {
        public GiteaApi(IHttpService http)
        {
            this.http = http;
        }

        public GiteaRepo? GetRepo(GiteaRef reference)
            => JsonConvert.DeserializeObject<GiteaRepo>(
                   http.DownloadText(new Uri($"https://{reference.Host}/api/v1/repos/{reference.Owner}/{reference.Repository}"))
                   ?? "");

        public GiteaRelease[] GetReleases(GiteaRef reference)
            => JsonConvert.DeserializeObject<GiteaRelease[]>(
                   http.DownloadText(new Uri($"https://{reference.Host}/api/v1/repos/{reference.Owner}/{reference.Repository}/releases"))
                   ?? "")
                   ?? Array.Empty<GiteaRelease>();

        private readonly IHttpService http;
    }
}
