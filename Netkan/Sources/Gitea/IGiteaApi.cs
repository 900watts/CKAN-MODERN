namespace CKAN.NetKAN.Sources.Gitea
{
    internal interface IGiteaApi
    {
        GiteaRepo?     GetRepo(GiteaRef reference);
        GiteaRelease[] GetReleases(GiteaRef reference);
    }
}
