<div class="trophies-list">
    <!-- BEGIN trophies -->
    <div class="trophy-item" data-toggle="tooltip" data-placement="top" title="{trophies.description}" style="background:url('../../plugins/nodebb-plugin-trophies/static/trophies/{trophies.image}');">
        <span class="name">{trophies.name}</span>
    </div>
    <!-- END trophies -->
    <script>
    $(document).ready(function() {
        $('[data-toggle="tooltip"]').tooltip();
    });
    </script>
</div>
