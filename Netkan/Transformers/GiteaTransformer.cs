using System;
using System.Linq;
using System.Collections.Generic;

using Newtonsoft.Json.Linq;
using log4net;

using CKAN.NetKAN.Model;
using CKAN.NetKAN.Sources.Gitea;
using CKAN.NetKAN.Extensions;

namespace CKAN.NetKAN.Transformers
{
    internal sealed class GiteaTransformer : ITransformer
    {
        public GiteaTransformer(IGiteaApi api)
        {
            this.api = api;
        }

        public string Name => "gitea";

        public IEnumerable<Metadata> Transform(Metadata metadata, TransformOptions opts)
        {
            if (metadata.Kref?.Source == "gitea")
            {

                log.InfoFormat("Executing GitHub transformation with {0}", metadata.Kref);
                log.DebugFormat("Input metadata:{0}{1}", Environment.NewLine, metadata.AllJson);

                var giteaRef  = new GiteaRef(metadata.Kref);
                var giteaRepo = api.GetRepo(giteaRef);
                if (giteaRepo == null)
                {
                    throw new Kraken("Failed to get Gitea repo info!");
                }

                var releases = api.GetReleases(giteaRef);
                if (opts.SkipReleases.HasValue)
                {
                    releases = releases.Skip(opts.SkipReleases.Value).ToArray();
                }
                if (opts.Releases.HasValue)
                {
                    releases = releases.Take(opts.Releases.Value).ToArray();
                }

                foreach (var rel in releases)
                {
                    var json = metadata.Json();
                    json.Remove("$kref");

                    json.SafeAdd("abstract", giteaRepo.Description);
                    json.SafeAdd("name",     giteaRepo.Name);
                    json.SafeAdd("author",   giteaRepo.Owner?.Login);
                    json.SafeAdd("version",  rel.Tag?.ToString());
                    json.SafeMerge("x_netkan_version_pieces",
                                   new JObject()
                                   {
                                       { "tag", rel.Tag?.ToString() },
                                   });
                    json.SafeMerge("resources", giteaRepo.Resources);

                    if (rel.PreRelease)
                    {
                        json.SafeAdd("release_status", "testing");
                    }

                    if (rel.Assets?.FirstOrDefault(a => a.Name?.EndsWith(".zip")
                                                              ?? false)
                        is GiteaReleaseAsset { Download: Uri url } asset)
                    {
                        json.SafeAdd("download",     url.ToString());
                        json.SafeAdd("release_date", asset.Created);
                    }
                    else
                    {
                        log.InfoFormat("No release assets found");
                    }

                    log.DebugFormat("Transformed metadata:{0}{1}", Environment.NewLine, json);

                    yield return new Metadata(json);
                }
            }
            else
            {
                yield return metadata;
            }
        }

        private readonly IGiteaApi api;

        private static readonly ILog log = LogManager.GetLogger(typeof(GiteaTransformer));
    }
}
