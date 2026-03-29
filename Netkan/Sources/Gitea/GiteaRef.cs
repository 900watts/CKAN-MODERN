using System.Text.RegularExpressions;

using CKAN.NetKAN.Model;

namespace CKAN.NetKAN.Sources.Gitea
{
    internal class GiteaRef
    {
        public GiteaRef(RemoteRef remoteRef)
        {
            if (remoteRef.Id != null
                && Pattern.Match(remoteRef.Id) is Match { Success: true } match)
            {
                Host       = match.Groups["host"].Value;
                Owner      = match.Groups["owner"].Value;
                Repository = match.Groups["repository"].Value;
            }
            else
            {
                throw new Kraken(string.Format(@"Could not parse reference: ""{0}""", remoteRef));
            }
        }

        public readonly string Host;
        public readonly string Owner;
        public readonly string Repository;

        private static readonly Regex Pattern =
            new Regex(@"^(?<host>[^/]+)/(?<owner>[^/]+)/(?<repository>[^/]+)$",
                      RegexOptions.Compiled);
    }
}
